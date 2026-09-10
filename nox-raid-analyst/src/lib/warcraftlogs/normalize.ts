/**
 * Raw Warcraft Logs JSON -> NOX domain model.
 *
 * The `table` and `events` fields of the v2 API are untyped JSON whose exact
 * shape varies by data type and log version. Every reader here is defensive:
 * an unexpected shape yields null/empty (and a coverage note upstream), never
 * a fabricated value and never a crash.
 */

import type { AbilityUsage, NoxActor, NoxFight, NoxReport, ReportGuild, Role } from '@/lib/types';
import { difficultyLabel } from '@/lib/format';
import { roleForSpec } from '@/lib/analysis/roles';

// --- primitive readers -----------------------------------------------------

type Json = unknown;

export function asRecord(value: Json): Record<string, Json> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

export function asArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

export function num(value: Json): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Numeric read that defaults to 0 — only for additive totals. */
export function numOr0(value: Json): number {
  return num(value) ?? 0;
}

export function str(value: Json): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function bool(value: Json): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

// --- report ----------------------------------------------------------------

/**
 * Warcraft Logs expresses boss/fight percentages as hundredths of a percent
 * (10000 = 100.00%). Normalize to a plain 0-100 number.
 */
export function normalizePercentage(value: Json): number | null {
  const raw = num(value);
  if (raw === null) return null;
  const pct = raw / 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

export function normalizeReport(raw: Json): NoxReport | null {
  const report = asRecord(raw);
  if (!report) return null;

  const code = str(report.code);
  if (!code) return null;

  const startTime = num(report.startTime) ?? 0;
  const endTime = num(report.endTime) ?? 0;

  const actors = normalizeActors(report.masterData);
  const fights = normalizeFights(report.fights);

  return {
    code,
    title: str(report.title) ?? 'Untitled report',
    owner: str(asRecord(report.owner)?.name),
    guild: normalizeGuild(report.guild),
    zone: {
      id: num(asRecord(report.zone)?.id),
      name: str(asRecord(report.zone)?.name),
    },
    startTime,
    endTime,
    fights,
    actors,
    source: 'warcraftlogs',
  };
}

function normalizeGuild(raw: Json): ReportGuild | null {
  const guild = asRecord(raw);
  const name = str(guild?.name);
  if (!name) return null;
  const server = asRecord(guild?.server);
  return {
    name,
    server: str(server?.name),
    region: str(asRecord(server?.region)?.compactName),
  };
}

function normalizeActors(rawMasterData: Json): NoxActor[] {
  const actors = asArray(asRecord(rawMasterData)?.actors);
  const out: NoxActor[] = [];
  for (const entry of actors) {
    const actor = asRecord(entry);
    if (!actor) continue;
    const id = num(actor.id);
    const name = str(actor.name);
    if (id === null || !name) continue;
    // masterData reports the class in `subType` for player actors.
    out.push({
      id,
      name,
      className: str(actor.subType),
      spec: null,
      role: 'unknown',
      server: str(actor.server),
      roleConfirmed: false,
    });
  }
  return out;
}

export function normalizeFights(raw: Json): NoxFight[] {
  const fights: NoxFight[] = [];
  for (const entry of asArray(raw)) {
    const fight = asRecord(entry);
    if (!fight) continue;
    const id = num(fight.id);
    if (id === null) continue;

    const startTime = num(fight.startTime) ?? 0;
    const endTime = num(fight.endTime) ?? startTime;
    const encounterId = num(fight.encounterID) ?? 0;
    const difficulty = num(fight.difficulty);

    fights.push({
      id,
      name: str(fight.name) ?? `Fight ${id}`,
      encounterId,
      difficulty,
      difficultyLabel: difficultyLabel(difficulty),
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      kill: bool(fight.kill),
      bossPercentage: normalizePercentage(fight.bossPercentage),
      fightPercentage: normalizePercentage(fight.fightPercentage),
      friendlyPlayerIds: asArray(fight.friendlyPlayers)
        .map((v) => num(v))
        .filter((v): v is number => v !== null),
      isEncounter: encounterId !== 0,
      attemptNumber: null,
      attemptTotal: null,
    });
  }
  return numberAttempts(fights);
}

/**
 * Label each boss fight with its pull number within the report, scoped to
 * encounter + difficulty so Heroic and Mythic attempts count separately.
 */
export function numberAttempts(fights: NoxFight[]): NoxFight[] {
  const totals = new Map<string, number>();
  for (const fight of fights) {
    if (!fight.isEncounter) continue;
    const k = `${fight.encounterId}:${fight.difficulty ?? 'x'}`;
    totals.set(k, (totals.get(k) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return fights.map((fight) => {
    if (!fight.isEncounter) return fight;
    const k = `${fight.encounterId}:${fight.difficulty ?? 'x'}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { ...fight, attemptNumber: n, attemptTotal: totals.get(k) ?? n };
  });
}

// --- playerDetails (role + spec) -------------------------------------------

interface DetailBucket {
  key: 'tanks' | 'healers' | 'dps';
  role: Role | null;
}

const BUCKETS: DetailBucket[] = [
  { key: 'tanks', role: 'tank' },
  { key: 'healers', role: 'healer' },
  // DPS split into melee/ranged by spec; the bucket alone cannot tell them apart.
  { key: 'dps', role: null },
];

/**
 * Enrich actors with role and spec from the playerDetails payload.
 * Actors absent from playerDetails keep `roleConfirmed: false`.
 */
export function applyPlayerDetails(actors: NoxActor[], rawPlayerDetails: Json): NoxActor[] {
  const byId = new Map(actors.map((a) => [a.id, { ...a }]));

  // The payload nests as data.playerDetails.{tanks,healers,dps}; tolerate a
  // flattened shape too.
  const root = asRecord(rawPlayerDetails);
  const details =
    asRecord(asRecord(root?.data)?.playerDetails) ?? asRecord(root?.playerDetails) ?? root;
  if (!details) return actors;

  for (const bucket of BUCKETS) {
    for (const entry of asArray(details[bucket.key])) {
      const player = asRecord(entry);
      if (!player) continue;
      const id = num(player.id);
      if (id === null) continue;

      const existing = byId.get(id);
      const className = str(player.type) ?? existing?.className ?? null;
      const spec = readSpec(player);
      const role = bucket.role ?? roleForSpec(className, spec);

      byId.set(id, {
        id,
        name: str(player.name) ?? existing?.name ?? `Actor ${id}`,
        className,
        spec,
        role,
        server: str(player.server) ?? existing?.server ?? null,
        roleConfirmed: true,
      });
    }
  }

  return actors.map((a) => byId.get(a.id) ?? a);
}

/** Spec comes from `specs[0].spec`, or from the `Class-Spec` icon token. */
function readSpec(player: Record<string, Json>): string | null {
  const specs = asArray(player.specs);
  for (const s of specs) {
    const spec = str(asRecord(s)?.spec);
    if (spec) return spec;
  }
  const icon = str(player.icon);
  if (icon?.includes('-')) {
    const [, specPart] = icon.split('-');
    if (specPart) return specPart;
  }
  return null;
}

// --- tables ----------------------------------------------------------------

/**
 * Pull the entry array out of a table payload. Warcraft Logs nests it as
 * `data.entries` for most types but returns `data` directly as an array for
 * some, so both are accepted.
 */
export function readTableEntries(raw: Json): Record<string, Json>[] {
  const root = asRecord(raw);
  const data = root ? root.data : undefined;

  const candidates: Json[] = [
    asRecord(data)?.entries,
    data,
    root?.entries,
    raw,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord).filter((v): v is Record<string, Json> => v !== null);
    }
  }
  return [];
}

/** `data.totalTime` where present — the table's own notion of fight length. */
export function readTableTotalTime(raw: Json): number | null {
  const root = asRecord(raw);
  return num(asRecord(root?.data)?.totalTime) ?? num(root?.totalTime);
}

/**
 * Normalize an entry's `abilities` array into AbilityUsage.
 * `totalKey` selects which field carries the meaningful count for this table:
 * cast tables put the cast count in `total`, damage tables put the amount there.
 */
export function readAbilities(entry: Record<string, Json>, kind: 'amount' | 'casts'): AbilityUsage[] {
  const out: AbilityUsage[] = [];
  for (const raw of asArray(entry.abilities)) {
    const ability = asRecord(raw);
    if (!ability) continue;
    const name = str(ability.name);
    if (!name) continue;

    const total = num(ability.total);
    const hits = num(ability.hitCount) ?? num(ability.hits) ?? num(ability.uses);

    out.push({
      abilityId: num(ability.guid) ?? num(ability.abilityGameID) ?? null,
      name,
      icon: str(ability.abilityIcon) ?? str(ability.icon) ?? null,
      casts: kind === 'casts' ? total : (num(ability.casts) ?? null),
      hits: kind === 'casts' ? hits : (hits ?? null),
      total: kind === 'amount' ? total : null,
    });
  }
  return out;
}

// --- ability dictionary ----------------------------------------------------

export interface AbilityInfo {
  name: string;
  icon: string | null;
}

/**
 * gameID -> ability name/icon, taken from masterData.
 *
 * Event streams reference abilities only by numeric id, so this dictionary is
 * what lets a timeline entry say "Shattering Bellow" instead of "spell 12345".
 * It is held server-side only; it is far too large to ship to the browser.
 */
export type AbilityDictionary = Map<number, AbilityInfo>;

export function normalizeAbilities(rawMasterData: Json): AbilityDictionary {
  const dictionary: AbilityDictionary = new Map();
  for (const raw of asArray(asRecord(rawMasterData)?.abilities)) {
    const ability = asRecord(raw);
    if (!ability) continue;
    const id = num(ability.gameID);
    const name = str(ability.name);
    if (id === null || !name) continue;
    dictionary.set(id, { name, icon: str(ability.icon) });
  }
  return dictionary;
}

/** Resolve an ability id to a display name, never inventing one. */
export function abilityName(dictionary: AbilityDictionary, id: number | null): string | null {
  if (id === null) return null;
  return dictionary.get(id)?.name ?? null;
}

export function abilityIcon(dictionary: AbilityDictionary, id: number | null): string | null {
  if (id === null) return null;
  return dictionary.get(id)?.icon ?? null;
}
