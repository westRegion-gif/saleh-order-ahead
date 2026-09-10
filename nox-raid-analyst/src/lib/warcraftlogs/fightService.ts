/**
 * FightService — orchestrates every retrieval needed to analyse one pull and
 * hands back a fully normalized FightAnalysis.
 *
 * Cost discipline: independent tables are fetched in parallel, each one is
 * cached and deduplicated, and a failure in any single optional table degrades
 * that dataset to "not covered" rather than failing the whole analysis.
 */

import 'server-only';
import type { DataCoverage, DeathRecord, FightAnalysis, NoxFight } from '@/lib/types';
import { dedupe, TTL } from '@/lib/cache';
import { NoxError } from './errors';
import { graphql } from './client';
import { TABLE_QUERY, TABLE_TYPES, EVENT_TYPES } from './queries';
import { readTableEntries, abilityName } from './normalize';
import { fetchReport, fetchFightRoster, type ReportBundle } from './reportService';
import { fetchEvents } from './eventService';
import { warcraftLogsLink } from './parseReport';
import { buildPlayerStats, type PlayerTables } from '@/lib/analysis/playerEngine';
import { attachDeathWindow, buildDeaths, DEATH_WINDOW_MS, toFightRelative } from '@/lib/analysis/deathAnalyzer';
import { buildDamageSources, buildFindings, buildRaidSummary, buildTimeline } from '@/lib/analysis/raidEngine';
import { EvidenceBuilder } from '@/lib/analysis/evidence';

type Entry = Record<string, unknown>;

/** Cap on how many deaths get an event-level window reconstruction. */
const MAX_DEATH_WINDOWS = 10;

interface TableResponse {
  reportData?: { report?: { table?: unknown } | null } | null;
}

/**
 * Fetch one table. Returns null (never throws) for optional datasets so a
 * missing table becomes a coverage note instead of a failed analysis.
 */
async function fetchTable(
  code: string,
  fightId: number,
  dataType: string,
  fetchImpl?: typeof fetch,
): Promise<Entry[] | null> {
  try {
    const { value } = await dedupe(
      `wcl:table:${code}:${fightId}:${dataType}`,
      TTL.fight,
      async () => {
        const data = await graphql<TableResponse>(
          TABLE_QUERY,
          { code, fightIDs: [fightId], dataType, hostilityType: 'Friendlies' },
          { label: `table:${dataType}`, fetchImpl },
        );
        return readTableEntries(data.reportData?.report?.table);
      },
      `table ${dataType} ${code}#${fightId}`,
    );
    return value;
  } catch (err) {
    // Auth/rate-limit failures are fatal for the whole request; a single
    // missing optional table is not.
    if (err instanceof NoxError && ['AUTH_FAILED', 'RATE_LIMITED', 'NOT_CONFIGURED', 'REPORT_PRIVATE'].includes(err.code)) {
      throw err;
    }
    return null;
  }
}

async function fetchEventsSafe(args: Parameters<typeof fetchEvents>[0]): Promise<Entry[] | null> {
  try {
    const page = await fetchEvents(args);
    return page.events;
  } catch (err) {
    if (err instanceof NoxError && ['AUTH_FAILED', 'RATE_LIMITED', 'NOT_CONFIGURED'].includes(err.code)) {
      throw err;
    }
    return null;
  }
}

export interface AnalyseFightArgs {
  code: string;
  fightId: number;
  fetchImpl?: typeof fetch;
}

export async function analyseFight(args: AnalyseFightArgs): Promise<FightAnalysis> {
  const { code, fightId, fetchImpl } = args;

  const bundle: ReportBundle = await fetchReport(code, fetchImpl);
  const { report, abilities } = bundle;

  const fight = report.fights.find((f) => f.id === fightId);
  if (!fight) throw new NoxError('FIGHT_NOT_FOUND');

  const { actors } = await fetchFightRoster(report, fightId, fetchImpl);

  // --- parallel table retrieval -------------------------------------------
  const [damageDone, healing, damageTaken, casts, interrupts, dispels, deathEntries] = await Promise.all([
    fetchTable(code, fightId, TABLE_TYPES.damageDone, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.healing, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.damageTaken, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.casts, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.interrupts, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.dispels, fetchImpl),
    fetchTable(code, fightId, TABLE_TYPES.deaths, fetchImpl),
  ]);

  const coverage: DataCoverage = {
    damage: damageDone !== null,
    healing: healing !== null,
    damageTaken: damageTaken !== null,
    casts: casts !== null,
    interrupts: interrupts !== null,
    dispels: dispels !== null,
    deaths: deathEntries !== null,
    deathEvents: false,
    notes: [],
  };

  const tables: PlayerTables = {
    damageDone: damageDone ?? [],
    healing: healing ?? [],
    damageTaken: damageTaken ?? [],
    casts: casts ?? [],
    interrupts: interrupts ?? [],
    dispels: dispels ?? [],
  };

  for (const [label, present] of [
    ['damage', coverage.damage],
    ['healing', coverage.healing],
    ['damage taken', coverage.damageTaken],
    ['casts', coverage.casts],
    ['interrupts', coverage.interrupts],
    ['dispels', coverage.dispels],
    ['deaths', coverage.deaths],
  ] as const) {
    if (!present) coverage.notes.push(`The ${label} table could not be retrieved for this pull.`);
  }

  // --- deaths --------------------------------------------------------------
  let deaths: DeathRecord[] = buildDeaths({
    entries: deathEntries ?? [],
    actors,
    fight,
    abilities,
  });

  const deathsByActor = new Map<number, number>();
  for (const death of deaths) {
    deathsByActor.set(death.actorId, (deathsByActor.get(death.actorId) ?? 0) + 1);
  }

  const players = buildPlayerStats({ fight, actors, tables, deathsByActor });
  if (players.length === 0) throw new NoxError('NO_PLAYER_DATA');

  // --- per-death damage windows (bounded, narrowed to the dying player) ----
  const windowTargets = deaths.slice(0, MAX_DEATH_WINDOWS);
  if (windowTargets.length < deaths.length) {
    coverage.notes.push(
      `Event-level death windows were reconstructed for the first ${MAX_DEATH_WINDOWS} deaths only.`,
    );
  }

  const windows = await Promise.all(
    windowTargets.map(async (death) => {
      if (death.actorId < 0) return null;
      const absoluteDeath = fight.startTime + death.timestampMs;
      const events = await fetchEventsSafe({
        code,
        fightId,
        dataType: EVENT_TYPES.damageTaken,
        startTime: Math.max(fight.startTime, absoluteDeath - DEATH_WINDOW_MS),
        endTime: absoluteDeath,
        targetId: death.actorId,
        fetchImpl,
      });
      return events;
    }),
  );

  deaths = deaths.map((death, index) => {
    if (index >= windowTargets.length) return death;
    const events = windows[index];
    if (!events) return death;
    return attachDeathWindow(death, events, fight, abilities);
  });
  coverage.deathEvents = windows.some((w) => w !== null);
  if (deaths.length > 0 && !coverage.deathEvents) {
    coverage.notes.push('Pre-death damage windows were unavailable, so deaths show a killing blow only.');
  }

  // --- utility events for the timeline ------------------------------------
  const [interruptEvents, dispelEvents] = await Promise.all([
    coverage.interrupts && (interrupts?.length ?? 0) > 0
      ? fetchEventsSafe({
          code,
          fightId,
          dataType: EVENT_TYPES.interrupts,
          startTime: fight.startTime,
          endTime: fight.endTime,
          fetchImpl,
        })
      : Promise.resolve(null),
    coverage.dispels && (dispels?.length ?? 0) > 0
      ? fetchEventsSafe({
          code,
          fightId,
          dataType: EVENT_TYPES.dispels,
          startTime: fight.startTime,
          endTime: fight.endTime,
          fetchImpl,
        })
      : Promise.resolve(null),
  ]);

  // --- assemble ------------------------------------------------------------
  const summary = buildRaidSummary({ fight, players, deaths });
  const damageTakenSources = buildDamageSources(damageTaken ?? []);
  const evidence = new EvidenceBuilder({ reportCode: code, fightId });

  const timeline = buildTimeline({
    fight,
    deaths,
    interruptEvents: interruptEvents ?? [],
    dispelEvents: dispelEvents ?? [],
    actors,
    abilityNameFor: (id) => abilityName(abilities, id),
    toRelative: (timestamp) => toFightRelative(timestamp, fight),
  });

  const findings = buildFindings({
    fight,
    summary,
    players,
    deaths,
    damageSources: damageTakenSources,
    coverage,
    evidence,
  });

  return {
    reportCode: code,
    reportTitle: report.title,
    fight,
    summary,
    players,
    deaths,
    damageTakenSources,
    timeline,
    findings,
    coverage,
    reportLink: warcraftLogsLink(code, fightId),
    source: 'warcraftlogs',
  };
}

/** Resolve which fight to analyse when the user did not pick one. */
export function pickDefaultFight(fights: NoxFight[], requested: number | null, wantsLast: boolean): NoxFight | null {
  if (requested !== null) {
    const match = fights.find((f) => f.id === requested);
    if (match) return match;
  }
  const encounters = fights.filter((f) => f.isEncounter);
  const pool = encounters.length > 0 ? encounters : fights;
  if (wantsLast) return pool[pool.length - 1] ?? null;
  // Prefer the first kill, else the longest attempt — the most informative pull.
  const kill = pool.find((f) => f.kill === true);
  if (kill) return kill;
  return [...pool].sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
}
