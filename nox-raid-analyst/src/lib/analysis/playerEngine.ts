/**
 * PlayerAnalysisEngine — merges the per-fight tables into one row per player.
 *
 * DATA TRUTH: a metric is 0 only when Warcraft Logs reported 0. When a table
 * could not be retrieved at all, the corresponding coverage flag is false and
 * the UI shows "—" rather than a misleading zero.
 */

import type { AbilityUsage, NoxActor, NoxFight, PlayerFightStats, Role } from '@/lib/types';
import { readAbilities, num, numOr0, str } from '@/lib/warcraftlogs/normalize';
import { roleForSpec } from './roles';

type Entry = Record<string, unknown>;

export interface PlayerTables {
  damageDone: Entry[];
  healing: Entry[];
  damageTaken: Entry[];
  casts: Entry[];
  interrupts: Entry[];
  dispels: Entry[];
}

/** Index a table by actor id, falling back to name when id is absent. */
function indexEntries(entries: Entry[]): { byId: Map<number, Entry>; byName: Map<string, Entry> } {
  const byId = new Map<number, Entry>();
  const byName = new Map<string, Entry>();
  for (const entry of entries) {
    const id = num(entry.id);
    const name = str(entry.name);
    if (id !== null && !byId.has(id)) byId.set(id, entry);
    if (name && !byName.has(name)) byName.set(name, entry);
  }
  return { byId, byName };
}

function lookup(
  index: { byId: Map<number, Entry>; byName: Map<string, Entry> },
  actor: NoxActor,
): Entry | null {
  return index.byId.get(actor.id) ?? index.byName.get(actor.name) ?? null;
}

/** Per-second rate over the fight duration. Returns 0 for a zero-length fight. */
export function perSecond(total: number, durationMs: number): number {
  if (!Number.isFinite(total) || durationMs <= 0) return 0;
  return (total / durationMs) * 1000;
}

export function share(part: number, whole: number): number {
  if (!Number.isFinite(part) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * Decide the roster for this fight.
 *
 * `friendlyPlayers` on the fight is authoritative when present; otherwise every
 * actor that appears in any table is used, so a log missing that field still
 * produces a complete player list.
 */
export function resolveFightRoster(fight: NoxFight, actors: NoxActor[], tables: PlayerTables): NoxActor[] {
  if (fight.friendlyPlayerIds.length > 0) {
    const allowed = new Set(fight.friendlyPlayerIds);
    const scoped = actors.filter((a) => allowed.has(a.id));
    if (scoped.length > 0) return scoped;
  }

  const seen = new Set<number>();
  for (const table of Object.values(tables)) {
    for (const entry of table) {
      const id = num(entry.id);
      if (id !== null) seen.add(id);
    }
  }
  const fromTables = actors.filter((a) => seen.has(a.id));
  return fromTables.length > 0 ? fromTables : actors;
}

export interface BuildPlayersArgs {
  fight: NoxFight;
  actors: NoxActor[];
  tables: PlayerTables;
  /** Death counts keyed by actor id, derived from the Deaths dataset. */
  deathsByActor: Map<number, number>;
}

export function buildPlayerStats(args: BuildPlayersArgs): PlayerFightStats[] {
  const { fight, tables, deathsByActor } = args;
  const roster = resolveFightRoster(fight, args.actors, tables);

  const damageIdx = indexEntries(tables.damageDone);
  const healingIdx = indexEntries(tables.healing);
  const takenIdx = indexEntries(tables.damageTaken);
  const castsIdx = indexEntries(tables.casts);
  const interruptIdx = indexEntries(tables.interrupts);
  const dispelIdx = indexEntries(tables.dispels);

  const durationMs = fight.durationMs;

  const rows = roster.map((actor): PlayerFightStats => {
    const damageEntry = lookup(damageIdx, actor);
    const healingEntry = lookup(healingIdx, actor);
    const takenEntry = lookup(takenIdx, actor);
    const castsEntry = lookup(castsIdx, actor);

    const damage = numOr0(damageEntry?.total);
    const healing = numOr0(healingEntry?.total);
    const damageTaken = numOr0(takenEntry?.total);

    // activeTime is reported on the damage table for DPS and the healing table
    // for healers; take whichever the log actually recorded.
    const activeTimeMs = num(damageEntry?.activeTime) ?? num(healingEntry?.activeTime);

    const role: Role = actor.role !== 'unknown' ? actor.role : roleForSpec(actor.className, actor.spec);

    return {
      actorId: actor.id,
      name: actor.name,
      className: actor.className,
      spec: actor.spec,
      role,
      damage,
      dps: perSecond(damage, durationMs),
      healing,
      hps: perSecond(healing, durationMs),
      damageTaken,
      deaths: deathsByActor.get(actor.id) ?? 0,
      interrupts: numOr0(lookup(interruptIdx, actor)?.total),
      dispels: numOr0(lookup(dispelIdx, actor)?.total),
      activeTimeMs,
      activeTimePct:
        activeTimeMs !== null && durationMs > 0
          ? Math.max(0, Math.min(100, (activeTimeMs / durationMs) * 100))
          : null,
      damageShare: 0,
      healingShare: 0,
      damageAbilities: sortAbilities(damageEntry ? readAbilities(damageEntry, 'amount') : []),
      healingAbilities: sortAbilities(healingEntry ? readAbilities(healingEntry, 'amount') : []),
      casts: sortCasts(castsEntry ? readAbilities(castsEntry, 'casts') : []),
    };
  });

  const totalDamage = rows.reduce((sum, r) => sum + r.damage, 0);
  const totalHealing = rows.reduce((sum, r) => sum + r.healing, 0);

  for (const row of rows) {
    row.damageShare = share(row.damage, totalDamage);
    row.healingShare = share(row.healing, totalHealing);
  }

  return rows.sort((a, b) => b.damage - a.damage);
}

function sortAbilities(abilities: AbilityUsage[]): AbilityUsage[] {
  return [...abilities].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}

function sortCasts(abilities: AbilityUsage[]): AbilityUsage[] {
  return [...abilities].sort((a, b) => (b.casts ?? 0) - (a.casts ?? 0));
}
