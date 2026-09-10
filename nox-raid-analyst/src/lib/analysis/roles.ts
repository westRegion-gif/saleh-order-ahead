/**
 * Static specialization -> role classification.
 *
 * This is game metadata, not log data: it says what a Protection Warrior *is*,
 * never what a player did. Warcraft Logs reports the class and spec; this table
 * only decides which of the four analysis buckets that spec belongs to, so that
 * a healer is never judged against a DPS meter.
 *
 * Keyed by `Class-Spec` because several spec names are shared across classes
 * (Frost Mage vs Frost Death Knight, Holy Paladin vs Holy Priest).
 */

import type { Role } from '@/lib/types';

const SPEC_ROLES: Record<string, Role> = {
  // Death Knight
  'DeathKnight-Blood': 'tank',
  'DeathKnight-Frost': 'melee',
  'DeathKnight-Unholy': 'melee',
  // Demon Hunter
  'DemonHunter-Havoc': 'melee',
  'DemonHunter-Vengeance': 'tank',
  // Druid
  'Druid-Balance': 'ranged',
  'Druid-Feral': 'melee',
  'Druid-Guardian': 'tank',
  'Druid-Restoration': 'healer',
  // Evoker
  'Evoker-Devastation': 'ranged',
  'Evoker-Preservation': 'healer',
  'Evoker-Augmentation': 'ranged',
  // Hunter
  'Hunter-BeastMastery': 'ranged',
  'Hunter-Marksmanship': 'ranged',
  'Hunter-Survival': 'melee',
  // Mage
  'Mage-Arcane': 'ranged',
  'Mage-Fire': 'ranged',
  'Mage-Frost': 'ranged',
  // Monk
  'Monk-Brewmaster': 'tank',
  'Monk-Mistweaver': 'healer',
  'Monk-Windwalker': 'melee',
  // Paladin
  'Paladin-Holy': 'healer',
  'Paladin-Protection': 'tank',
  'Paladin-Retribution': 'melee',
  // Priest
  'Priest-Discipline': 'healer',
  'Priest-Holy': 'healer',
  'Priest-Shadow': 'ranged',
  // Rogue
  'Rogue-Assassination': 'melee',
  'Rogue-Outlaw': 'melee',
  'Rogue-Subtlety': 'melee',
  // Shaman
  'Shaman-Elemental': 'ranged',
  'Shaman-Enhancement': 'melee',
  'Shaman-Restoration': 'healer',
  // Warlock
  'Warlock-Affliction': 'ranged',
  'Warlock-Demonology': 'ranged',
  'Warlock-Destruction': 'ranged',
  // Warrior
  'Warrior-Arms': 'melee',
  'Warrior-Fury': 'melee',
  'Warrior-Protection': 'tank',
};

/** Strip spaces/punctuation so "Beast Mastery" matches "BeastMastery". */
function key(className: string, spec: string): string {
  const c = className.replace(/[^A-Za-z]/g, '');
  const s = spec.replace(/[^A-Za-z]/g, '');
  return `${c}-${s}`;
}

/**
 * Resolve a role from class + spec. Returns 'unknown' when the pair is not
 * recognised rather than guessing — an unknown spec must not be silently
 * bucketed as DPS.
 */
export function roleForSpec(className: string | null, spec: string | null): Role {
  if (!className || !spec) return 'unknown';
  return SPEC_ROLES[key(className, spec)] ?? 'unknown';
}

export function isDps(role: Role): boolean {
  return role === 'melee' || role === 'ranged';
}

export const ROLE_LABEL: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee',
  ranged: 'Ranged',
  unknown: 'Unknown',
};

/** Official-ish class colours, used sparingly against the NOX palette. */
export const CLASS_COLORS: Record<string, string> = {
  DeathKnight: '#C41E3A',
  DemonHunter: '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B6D',
};

export function classColor(className: string | null): string | null {
  if (!className) return null;
  return CLASS_COLORS[className.replace(/[^A-Za-z]/g, '')] ?? null;
}
