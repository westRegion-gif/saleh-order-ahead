/**
 * Death analysis.
 *
 * The Deaths table gives the authoritative list of who died, when, and to what
 * killing blow. The final-seconds window is then reconstructed from the real
 * DamageTaken event stream for that player.
 *
 * What this module deliberately does NOT do: claim a player should have used a
 * defensive. Establishing that requires knowing the cooldown was available,
 * which the dataset does not prove. See DEFENSIVE_INCONCLUSIVE.
 */

import type { DamageEventLite, DeathRecord, NoxActor, NoxFight } from '@/lib/types';
import { formatTimestamp } from '@/lib/format';
import { abilityIcon, abilityName, asRecord, num, str, type AbilityDictionary } from '@/lib/warcraftlogs/normalize';
import { roleForSpec } from './roles';

type Entry = Record<string, unknown>;

/** Length of the reconstructed pre-death window. */
export const DEATH_WINDOW_MS = 12_000;

/**
 * Convert a Warcraft Logs timestamp to milliseconds since fight start.
 *
 * Table and event timestamps are relative to report start; some payloads are
 * already fight-relative. Both are handled rather than assuming one.
 */
export function toFightRelative(timestamp: number, fight: NoxFight): number {
  if (timestamp >= fight.startTime && timestamp <= fight.endTime) {
    return timestamp - fight.startTime;
  }
  if (timestamp >= 0 && timestamp <= fight.durationMs) {
    return timestamp;
  }
  // Out of range: clamp into the fight rather than emitting a nonsense time.
  return Math.max(0, Math.min(fight.durationMs, timestamp - fight.startTime));
}

export interface BuildDeathsArgs {
  entries: Entry[];
  actors: NoxActor[];
  fight: NoxFight;
  abilities: AbilityDictionary;
}

/** Build the ordered death list from the Deaths table. */
export function buildDeaths(args: BuildDeathsArgs): DeathRecord[] {
  const { entries, actors, fight, abilities } = args;
  const actorsById = new Map(actors.map((a) => [a.id, a]));
  const actorsByName = new Map(actors.map((a) => [a.name, a]));

  const records: Omit<DeathRecord, 'order'>[] = [];

  for (const entry of entries) {
    const id = num(entry.id);
    const name = str(entry.name);
    if (id === null && !name) continue;

    const actor = (id !== null ? actorsById.get(id) : undefined) ?? (name ? actorsByName.get(name) : undefined);

    const rawTime = num(entry.deathTime) ?? num(entry.timestamp);
    if (rawTime === null) continue;
    const timestampMs = toFightRelative(rawTime, fight);

    const killing = asRecord(entry.ability) ?? asRecord(entry.killingAbility);
    const killingId = num(killing?.guid) ?? num(killing?.abilityGameID) ?? num(entry.killingAbilityGameID);

    const className = actor?.className ?? str(entry.type);
    const spec = actor?.spec ?? null;

    records.push({
      actorId: id ?? actor?.id ?? -1,
      name: name ?? actor?.name ?? 'Unknown',
      className,
      spec,
      role: actor?.role && actor.role !== 'unknown' ? actor.role : roleForSpec(className, spec),
      timestampMs,
      timestampLabel: formatTimestamp(timestampMs),
      killingBlow: buildKillingBlow(killing, killingId, abilities),
      precedingDamage: [],
      damageInWindow: 0,
      windowMs: DEATH_WINDOW_MS,
      windowUnavailable: true,
    });
  }

  return records
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((record, index) => ({ ...record, order: index + 1 }));
}

function buildKillingBlow(
  killing: Record<string, unknown> | null,
  killingId: number | null,
  abilities: AbilityDictionary,
): DeathRecord['killingBlow'] {
  const name = str(killing?.name) ?? abilityName(abilities, killingId);
  if (!name && killingId === null) return null;
  return {
    abilityName: name,
    abilityId: killingId,
    abilityIcon: str(killing?.abilityIcon) ?? str(killing?.icon) ?? abilityIcon(abilities, killingId),
    sourceName: str(killing?.sourceName) ?? null,
    amount: num(killing?.amount),
  };
}

/**
 * Attach the pre-death damage window from a DamageTaken event stream.
 * Events are filtered to the dying player and the window preceding the death.
 */
export function attachDeathWindow(
  death: DeathRecord,
  events: Entry[],
  fight: NoxFight,
  abilities: AbilityDictionary,
): DeathRecord {
  const windowStart = death.timestampMs - DEATH_WINDOW_MS;
  const damage: DamageEventLite[] = [];

  for (const event of events) {
    const targetId = num(event.targetID);
    if (targetId !== null && targetId !== death.actorId) continue;

    const rawTime = num(event.timestamp);
    if (rawTime === null) continue;
    const timestampMs = toFightRelative(rawTime, fight);
    if (timestampMs < windowStart || timestampMs > death.timestampMs) continue;

    const amount = num(event.amount);
    if (amount === null || amount <= 0) continue;

    const abilityId = num(event.abilityGameID);
    damage.push({
      timestampMs,
      timestampLabel: formatTimestamp(timestampMs),
      abilityName: abilityName(abilities, abilityId),
      abilityId,
      abilityIcon: abilityIcon(abilities, abilityId),
      sourceName: str(event.sourceName),
      amount,
      overkill: num(event.overkill),
      mitigated: num(event.mitigated) ?? num(event.absorbed),
    });
  }

  damage.sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    ...death,
    precedingDamage: damage,
    damageInWindow: damage.reduce((sum, d) => sum + d.amount, 0),
    windowMs: DEATH_WINDOW_MS,
    // The window is "available" once the stream was successfully consulted,
    // even if it contained no qualifying hits.
    windowUnavailable: false,
  };
}

/**
 * The single largest hit in a death window, used to decide whether a death was
 * one burst or accumulated chip damage. Returns null when no window exists.
 */
export function largestHit(death: DeathRecord): DamageEventLite | null {
  if (death.precedingDamage.length === 0) return null;
  return death.precedingDamage.reduce((max, d) => (d.amount > max.amount ? d : max));
}

/** Deaths occurring within `windowMs` of each other, as clusters of 2+. */
export function findDeathClusters(deaths: DeathRecord[], windowMs = 5000): DeathRecord[][] {
  const clusters: DeathRecord[][] = [];
  let current: DeathRecord[] = [];

  for (const death of deaths) {
    const last = current[current.length - 1];
    if (last && death.timestampMs - last.timestampMs <= windowMs) {
      current.push(death);
    } else {
      if (current.length >= 2) clusters.push(current);
      current = [death];
    }
  }
  if (current.length >= 2) clusters.push(current);
  return clusters;
}
