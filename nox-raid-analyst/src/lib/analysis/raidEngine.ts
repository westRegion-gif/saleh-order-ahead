/**
 * RaidAnalysisEngine — deterministic, reproducible raid-level analysis.
 *
 * This runs BEFORE (and independently of) the AI layer. Everything the AI is
 * later asked to interpret is computed here first, so no model is ever asked
 * to do arithmetic or to recall what happened.
 */

import type {
  DamageSource,
  DataCoverage,
  DeathRecord,
  Finding,
  NoxActor,
  NoxFight,
  PlayerFightStats,
  RaidSummary,
  TimelineEvent,
} from '@/lib/types';
import { formatCompact, formatDuration, formatPercent, formatTimestamp } from '@/lib/format';
import { num, numOr0, str } from '@/lib/warcraftlogs/normalize';
import { compact, EvidenceBuilder, sortBySeverity } from './evidence';
import { findDeathClusters, largestHit } from './deathAnalyzer';
import { perSecond, share } from './playerEngine';

type Entry = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Raid summary
// ---------------------------------------------------------------------------

export function buildRaidSummary(args: {
  fight: NoxFight;
  players: PlayerFightStats[];
  deaths: DeathRecord[];
}): RaidSummary {
  const { fight, players, deaths } = args;

  const raidDamage = players.reduce((s, p) => s + p.damage, 0);
  const raidHealing = players.reduce((s, p) => s + p.healing, 0);
  const raidDamageTaken = players.reduce((s, p) => s + p.damageTaken, 0);

  const first = deaths[0] ?? null;

  const composition = { tanks: 0, healers: 0, melee: 0, ranged: 0, unknown: 0 };
  for (const player of players) {
    if (player.role === 'tank') composition.tanks += 1;
    else if (player.role === 'healer') composition.healers += 1;
    else if (player.role === 'melee') composition.melee += 1;
    else if (player.role === 'ranged') composition.ranged += 1;
    else composition.unknown += 1;
  }

  return {
    fightId: fight.id,
    encounter: fight.name,
    difficultyLabel: fight.difficultyLabel,
    durationMs: fight.durationMs,
    durationLabel: formatDuration(fight.durationMs),
    kill: fight.kill,
    bossPercentage: fight.bossPercentage,
    raidDamage,
    raidDps: perSecond(raidDamage, fight.durationMs),
    raidHealing,
    raidHps: perSecond(raidHealing, fight.durationMs),
    raidDamageTaken,
    deaths: deaths.length,
    interrupts: players.reduce((s, p) => s + p.interrupts, 0),
    dispels: players.reduce((s, p) => s + p.dispels, 0),
    playerCount: players.length,
    firstDeathMs: first?.timestampMs ?? null,
    firstDeathLabel: first ? first.timestampLabel : null,
    firstDeathPlayer: first?.name ?? null,
    composition,
  };
}

// ---------------------------------------------------------------------------
// Damage taken sources
// ---------------------------------------------------------------------------

/**
 * Aggregate the per-player DamageTaken tables into raid-wide sources by
 * ability, so "what is killing the raid" is answerable from one table fetch.
 */
export function buildDamageSources(entries: Entry[], limit = 12): DamageSource[] {
  const byAbility = new Map<string, DamageSource>();

  for (const entry of entries) {
    const abilities = Array.isArray(entry.abilities) ? entry.abilities : [];
    for (const raw of abilities) {
      const ability = raw as Entry | null;
      if (!ability || typeof ability !== 'object') continue;
      const name = str(ability.name);
      if (!name) continue;

      const id = num(ability.guid) ?? num(ability.abilityGameID);
      const key = id !== null ? `id:${id}` : `name:${name}`;
      const total = numOr0(ability.total);
      const hits = num(ability.hitCount) ?? num(ability.hits);

      const existing = byAbility.get(key);
      if (existing) {
        existing.total += total;
        if (hits !== null) existing.hits = (existing.hits ?? 0) + hits;
      } else {
        byAbility.set(key, {
          abilityName: name,
          abilityId: id,
          abilityIcon: str(ability.abilityIcon) ?? str(ability.icon),
          total,
          hits,
          share: 0,
        });
      }
    }
  }

  const sources = [...byAbility.values()];
  const grandTotal = sources.reduce((s, src) => s + src.total, 0);
  for (const source of sources) source.share = share(source.total, grandTotal);

  return sources.sort((a, b) => b.total - a.total).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineArgs {
  fight: NoxFight;
  deaths: DeathRecord[];
  interruptEvents: Entry[];
  dispelEvents: Entry[];
  actors: NoxActor[];
  abilityNameFor: (id: number | null) => string | null;
  toRelative: (timestamp: number) => number;
}

/**
 * A curated timeline: the events a raid leader would actually replay.
 * Individual deaths, death clusters, burst-damage kills, and the utility
 * events that had a target. Not a dump of every combat event.
 */
export function buildTimeline(args: TimelineArgs): TimelineEvent[] {
  const { fight, deaths, actors, abilityNameFor, toRelative } = args;
  const events: TimelineEvent[] = [];
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  const clusters = findDeathClusters(deaths);
  const clustered = new Set(clusters.flat().map((d) => `${d.actorId}:${d.timestampMs}`));

  for (const cluster of clusters) {
    const firstDeath = cluster[0];
    const lastDeath = cluster[cluster.length - 1];
    if (!firstDeath || !lastDeath) continue;
    const spanMs = lastDeath.timestampMs - firstDeath.timestampMs;
    events.push({
      timestampMs: firstDeath.timestampMs,
      timestampLabel: firstDeath.timestampLabel,
      kind: 'multi-death',
      severity: 'high',
      title: `${cluster.length} deaths in ${(spanMs / 1000).toFixed(1)}s`,
      detail: `${cluster.map((d) => d.name).join(', ')} died within ${(spanMs / 1000).toFixed(1)} seconds of each other.`,
      players: cluster.map((d) => d.name),
    });
  }

  for (const death of deaths) {
    const inCluster = clustered.has(`${death.actorId}:${death.timestampMs}`);
    const killer = death.killingBlow?.abilityName;
    events.push({
      timestampMs: death.timestampMs,
      timestampLabel: death.timestampLabel,
      kind: 'death',
      severity: inCluster ? 'medium' : death.order === 1 ? 'high' : 'medium',
      title: `${death.name} died`,
      detail: killer
        ? `Killing blow: ${killer}${death.killingBlow?.amount ? ` for ${formatCompact(death.killingBlow.amount)}` : ''}.`
        : 'Killing blow not recorded in the dataset.',
      players: [death.name],
    });

    // Flag a death dominated by one hit — that is a burst, not chip damage.
    const biggest = largestHit(death);
    if (biggest && death.damageInWindow > 0) {
      const dominance = (biggest.amount / death.damageInWindow) * 100;
      if (dominance >= 50) {
        events.push({
          timestampMs: biggest.timestampMs,
          timestampLabel: biggest.timestampLabel,
          kind: 'damage-spike',
          severity: 'medium',
          title: `Burst damage on ${death.name}`,
          detail: `${biggest.abilityName ?? 'An unnamed ability'} hit for ${formatCompact(biggest.amount)} — ${dominance.toFixed(0)}% of all damage taken in the ${death.windowMs / 1000}s before death.`,
          players: [death.name],
        });
      }
    }
  }

  for (const event of args.interruptEvents) {
    const timestamp = num(event.timestamp);
    if (timestamp === null) continue;
    const relative = toRelative(timestamp);
    const sourceId = num(event.sourceID);
    const interrupted = abilityNameFor(num(event.extraAbilityGameID));
    events.push({
      timestampMs: relative,
      timestampLabel: formatTimestamp(relative),
      kind: 'interrupt',
      severity: 'info',
      title: interrupted ? `${interrupted} interrupted` : 'Interrupt',
      detail: `${(sourceId !== null && actorNames.get(sourceId)) || 'A raider'} interrupted ${interrupted ?? 'an enemy cast'}.`,
      players: sourceId !== null && actorNames.has(sourceId) ? [actorNames.get(sourceId)!] : [],
    });
  }

  for (const event of args.dispelEvents) {
    const timestamp = num(event.timestamp);
    if (timestamp === null) continue;
    const relative = toRelative(timestamp);
    const sourceId = num(event.sourceID);
    const dispelled = abilityNameFor(num(event.extraAbilityGameID));
    events.push({
      timestampMs: relative,
      timestampLabel: formatTimestamp(relative),
      kind: 'dispel',
      severity: 'info',
      title: dispelled ? `${dispelled} dispelled` : 'Dispel',
      detail: `${(sourceId !== null && actorNames.get(sourceId)) || 'A raider'} dispelled ${dispelled ?? 'an effect'}.`,
      players: sourceId !== null && actorNames.has(sourceId) ? [actorNames.get(sourceId)!] : [],
    });
  }

  events.push({
    timestampMs: fight.durationMs,
    timestampLabel: formatTimestamp(fight.durationMs),
    kind: 'fight-end',
    severity: fight.kill ? 'info' : 'high',
    title: fight.kill ? 'Encounter defeated' : 'Wipe',
    detail:
      fight.kill === true
        ? `Killed in ${formatDuration(fight.durationMs)}.`
        : fight.bossPercentage !== null
          ? `Wiped with the boss at ${formatPercent(fight.bossPercentage)} after ${formatDuration(fight.durationMs)}.`
          : `Ended after ${formatDuration(fight.durationMs)}.`,
    players: [],
  });

  return events.sort((a, b) => a.timestampMs - b.timestampMs);
}

// ---------------------------------------------------------------------------
// Deterministic findings
// ---------------------------------------------------------------------------

export interface FindingsArgs {
  fight: NoxFight;
  summary: RaidSummary;
  players: PlayerFightStats[];
  deaths: DeathRecord[];
  damageSources: DamageSource[];
  coverage: DataCoverage;
  evidence: EvidenceBuilder;
}

/**
 * Findings computed purely from numbers. These stand on their own with AI
 * disabled, and are also the factual base the AI layer is given.
 */
export function buildFindings(args: FindingsArgs): Finding[] {
  const { fight, summary, players, deaths, damageSources, coverage, evidence: ev } = args;
  const findings: (Finding | null)[] = [];

  // --- outcome -------------------------------------------------------------
  if (fight.kill === false) {
    const items = [
      ev.build({
        category: 'timeline',
        metric: 'Result',
        value: summary.bossPercentage !== null ? `Wipe at ${formatPercent(summary.bossPercentage)}` : 'Wipe',
        rawValue: summary.bossPercentage ?? undefined,
      }),
      ev.build({
        category: 'timeline',
        metric: 'Duration',
        value: summary.durationLabel,
        rawValue: summary.durationMs,
      }),
    ];
    findings.push(
      ev.finding({
        severity: 'info',
        title: 'Pull ended in a wipe',
        finding:
          summary.bossPercentage !== null
            ? `The raid wiped after ${summary.durationLabel} with the boss at ${formatPercent(summary.bossPercentage)}.`
            : `The raid wiped after ${summary.durationLabel}.`,
        evidence: items,
        recommendation: null,
      }),
    );
  }

  // --- early first death ---------------------------------------------------
  const firstDeath = deaths[0];
  if (firstDeath && fight.durationMs > 0) {
    const fractionIntoFight = firstDeath.timestampMs / fight.durationMs;
    const isEarly = fractionIntoFight <= 0.35;
    const items = [
      ev.build({
        category: 'death',
        metric: 'First death',
        value: firstDeath.timestampLabel,
        rawValue: firstDeath.timestampMs,
        player: firstDeath.name,
        timestampMs: firstDeath.timestampMs,
      }),
      ev.build({
        category: 'death',
        metric: 'Elapsed at first death',
        value: `${(fractionIntoFight * 100).toFixed(0)}% into the pull`,
        rawValue: fractionIntoFight * 100,
        timestampMs: firstDeath.timestampMs,
      }),
    ];
    if (firstDeath.killingBlow?.abilityName) {
      items.push(
        ev.build({
          category: 'death',
          metric: 'Killing blow',
          value: firstDeath.killingBlow.abilityName,
          player: firstDeath.name,
          ability: firstDeath.killingBlow.abilityName,
          timestampMs: firstDeath.timestampMs,
        }),
      );
    }
    findings.push(
      ev.finding({
        severity: isEarly ? 'high' : 'low',
        title: isEarly ? 'Early first death' : 'First death',
        finding: `${firstDeath.name} (${firstDeath.role}) died at ${firstDeath.timestampLabel}, ${(fractionIntoFight * 100).toFixed(0)}% into the pull.`,
        evidence: items,
        recommendation: isEarly
          ? 'Losing a raider this early removes their output and their mechanic coverage for the rest of the pull. Establish what happened at this timestamp before changing anything else.'
          : null,
      }),
    );
  }

  // --- death clusters ------------------------------------------------------
  for (const cluster of findDeathClusters(deaths)) {
    const first = cluster[0];
    const last = cluster[cluster.length - 1];
    if (!first || !last) continue;
    const spanSeconds = (last.timestampMs - first.timestampMs) / 1000;
    findings.push(
      ev.finding({
        severity: 'high',
        title: `${cluster.length} deaths within ${spanSeconds.toFixed(1)}s`,
        finding: `${cluster.map((d) => d.name).join(', ')} died in a ${spanSeconds.toFixed(1)} second window starting at ${first.timestampLabel}. Simultaneous deaths usually indicate one shared cause rather than ${cluster.length} individual mistakes.`,
        evidence: cluster.map((death) =>
          ev.build({
            category: 'death',
            metric: 'Death',
            value: death.timestampLabel,
            rawValue: death.timestampMs,
            player: death.name,
            ability: death.killingBlow?.abilityName ?? undefined,
            timestampMs: death.timestampMs,
          }),
        ),
        recommendation:
          'Review this window as a single event. Identify the shared source before assigning individual blame.',
      }),
    );
  }

  // --- dominant incoming damage -------------------------------------------
  const topSource = damageSources[0];
  if (topSource && topSource.share >= 20) {
    findings.push(
      ev.finding({
        severity: topSource.share >= 40 ? 'medium' : 'low',
        title: `${topSource.abilityName} dominates incoming damage`,
        finding: `${topSource.abilityName} accounted for ${formatPercent(topSource.share)} of all damage the raid took (${formatCompact(topSource.total)}).`,
        evidence: [
          ev.build({
            category: 'damage-taken',
            metric: 'Damage taken',
            value: formatCompact(topSource.total),
            rawValue: topSource.total,
            ability: topSource.abilityName,
          }),
          ev.build({
            category: 'damage-taken',
            metric: 'Share of raid damage taken',
            value: formatPercent(topSource.share),
            rawValue: topSource.share,
            ability: topSource.abilityName,
          }),
        ],
        recommendation: `Healing and mitigation planning for this pull should be built around ${topSource.abilityName}.`,
      }),
    );
  }

  // --- utility -------------------------------------------------------------
  if (coverage.interrupts && summary.interrupts === 0) {
    findings.push(
      ev.finding({
        severity: 'low',
        title: 'No interrupts recorded',
        finding:
          'Warcraft Logs recorded zero interrupts for this pull. This is only a problem if the encounter has interruptible casts — NOX cannot determine that from the log alone.',
        evidence: [
          ev.build({ category: 'interrupt', metric: 'Raid interrupts', value: '0', rawValue: 0 }),
        ],
        recommendation:
          'Confirm whether this encounter has interruptible casts before treating this as a failure.',
      }),
    );
  }

  // --- deaths concentrated on one player ----------------------------------
  const deathsByPlayer = new Map<string, number>();
  for (const death of deaths) {
    deathsByPlayer.set(death.name, (deathsByPlayer.get(death.name) ?? 0) + 1);
  }
  for (const [name, count] of deathsByPlayer) {
    if (count < 2) continue;
    findings.push(
      ev.finding({
        severity: 'medium',
        title: `${name} died ${count} times`,
        finding: `${name} died ${count} times in this pull.`,
        evidence: deaths
          .filter((d) => d.name === name)
          .map((death) =>
            ev.build({
              category: 'death',
              metric: 'Death',
              value: death.timestampLabel,
              rawValue: death.timestampMs,
              player: name,
              ability: death.killingBlow?.abilityName ?? undefined,
              timestampMs: death.timestampMs,
            }),
          ),
        recommendation: 'Repeated deaths by one raider are worth a targeted review of that player’s pull.',
      }),
    );
  }

  // --- unresolved roles ----------------------------------------------------
  // Role-aware interpretation is only as good as the spec data. If some
  // players could not be classified, say so rather than quietly treating them
  // as DPS.
  const unknownRole = players.filter((p) => p.role === 'unknown');
  if (unknownRole.length > 0) {
    findings.push(
      ev.finding({
        severity: 'info',
        title: `Role undetermined for ${unknownRole.length} ${unknownRole.length === 1 ? 'player' : 'players'}`,
        finding: `Warcraft Logs did not provide a resolvable specialization for ${unknownRole
          .map((p) => p.name)
          .join(', ')}. Role-aware comparisons exclude them, and their numbers should not be read against any role baseline.`,
        evidence: unknownRole.map((player) =>
          ev.build({
            category: 'composition',
            metric: 'Specialization',
            value: player.spec ?? 'Not recorded',
            player: player.name,
          }),
        ),
        recommendation: null,
      }),
    );
  }

  // --- clean pull ----------------------------------------------------------
  if (deaths.length === 0 && coverage.deaths) {
    findings.push(
      ev.finding({
        severity: 'info',
        title: 'No deaths',
        finding: `The raid took ${formatCompact(summary.raidDamageTaken)} damage across ${summary.durationLabel} without losing a single raider.`,
        evidence: [
          ev.build({ category: 'death', metric: 'Deaths', value: '0', rawValue: 0 }),
          ev.build({
            category: 'damage-taken',
            metric: 'Raid damage taken',
            value: formatCompact(summary.raidDamageTaken),
            rawValue: summary.raidDamageTaken,
          }),
        ],
        recommendation: null,
      }),
    );
  }

  return sortBySeverity(compact(findings));
}
