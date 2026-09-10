import { describe, expect, it } from 'vitest';
import {
  applyPlayerDetails,
  normalizeAbilities,
  normalizePercentage,
  normalizeReport,
  numberAttempts,
  readAbilities,
  readTableEntries,
} from '@/lib/warcraftlogs/normalize';
import { DAMAGE_TABLE_RAW, PLAYER_DETAILS_RAW, REPORT_RAW } from './fixtures/wcl';

describe('normalizePercentage', () => {
  it('converts hundredths-of-a-percent to a 0-100 value', () => {
    expect(normalizePercentage(3150)).toBe(31.5);
    expect(normalizePercentage(10000)).toBe(100);
    expect(normalizePercentage(0)).toBe(0);
  });
  it('clamps out-of-range values instead of emitting nonsense', () => {
    expect(normalizePercentage(-500)).toBe(0);
    expect(normalizePercentage(20000)).toBe(100);
  });
  it('returns null for missing data rather than defaulting to zero', () => {
    expect(normalizePercentage(null)).toBeNull();
    expect(normalizePercentage(undefined)).toBeNull();
    expect(normalizePercentage('nope')).toBeNull();
  });
});

describe('normalizeReport', () => {
  const report = normalizeReport(REPORT_RAW)!;

  it('reads report identity', () => {
    expect(report.code).toBe('aBcD1234efGH5678');
    expect(report.title).toBe('Mythic Progression Night');
    expect(report.owner).toBe('RaidLeader');
    expect(report.guild).toEqual({ name: 'Nox', server: 'Silvermoon', region: 'EU' });
    expect(report.zone).toEqual({ id: 42, name: 'Test Citadel' });
  });

  it('normalizes fights with computed duration', () => {
    const gatekeeper = report.fights.find((f) => f.id === 2)!;
    expect(gatekeeper.durationMs).toBe(240_000);
    expect(gatekeeper.kill).toBe(false);
    expect(gatekeeper.bossPercentage).toBe(31.5);
    expect(gatekeeper.difficultyLabel).toBe('Mythic');
    expect(gatekeeper.isEncounter).toBe(true);
  });

  it('marks trash as a non-encounter', () => {
    expect(report.fights.find((f) => f.id === 1)!.isEncounter).toBe(false);
  });

  it('reads the player roster from masterData', () => {
    expect(report.actors).toHaveLength(4);
    const tank = report.actors.find((a) => a.name === 'Tankadin')!;
    expect(tank.className).toBe('Paladin');
    // Spec/role are unknown until playerDetails is applied.
    expect(tank.spec).toBeNull();
    expect(tank.role).toBe('unknown');
    expect(tank.roleConfirmed).toBe(false);
  });

  it('returns null for an unusable payload rather than throwing', () => {
    expect(normalizeReport(null)).toBeNull();
    expect(normalizeReport({})).toBeNull();
    expect(normalizeReport({ code: 123 })).toBeNull();
  });
});

describe('numberAttempts', () => {
  it('numbers pulls per encounter and difficulty', () => {
    const fights = normalizeReport(REPORT_RAW)!.fights;
    const attempts = fights.filter((f) => f.isEncounter);
    expect(attempts.map((f) => f.attemptNumber)).toEqual([1, 2]);
    expect(attempts.every((f) => f.attemptTotal === 2)).toBe(true);
  });

  it('counts difficulties separately', () => {
    const result = numberAttempts([
      { encounterId: 1, difficulty: 4, isEncounter: true } as never,
      { encounterId: 1, difficulty: 5, isEncounter: true } as never,
      { encounterId: 1, difficulty: 5, isEncounter: true } as never,
    ]);
    expect(result.map((f) => f.attemptNumber)).toEqual([1, 1, 2]);
  });

  it('leaves trash unnumbered', () => {
    const result = numberAttempts([
      { encounterId: 0, difficulty: null, isEncounter: false, attemptNumber: null, attemptTotal: null } as never,
    ]);
    expect(result[0]!.attemptNumber).toBeNull();
    expect(result[0]!.attemptTotal).toBeNull();
  });

  it('numbers trash-free reports straight from normalizeFights', () => {
    // normalizeFights seeds attemptNumber before numbering, so real payloads
    // always carry an explicit null rather than an absent field.
    const trash = normalizeReport(REPORT_RAW)!.fights.find((f) => !f.isEncounter)!;
    expect(trash.attemptNumber).toBeNull();
    expect(trash.attemptTotal).toBeNull();
  });
});

describe('applyPlayerDetails', () => {
  const report = normalizeReport(REPORT_RAW)!;
  const actors = applyPlayerDetails(report.actors, PLAYER_DETAILS_RAW);

  it('assigns tank and healer roles from their buckets', () => {
    expect(actors.find((a) => a.name === 'Tankadin')!.role).toBe('tank');
    expect(actors.find((a) => a.name === 'Healbot')!.role).toBe('healer');
  });

  it('splits dps into melee and ranged using the spec table', () => {
    expect(actors.find((a) => a.name === 'Stabby')!.role).toBe('melee');
    expect(actors.find((a) => a.name === 'Boomy')!.role).toBe('ranged');
  });

  it('records specs and marks the role confirmed', () => {
    const boomy = actors.find((a) => a.name === 'Boomy')!;
    expect(boomy.spec).toBe('Balance');
    expect(boomy.roleConfirmed).toBe(true);
  });

  it('leaves actors untouched when the payload is unusable', () => {
    expect(applyPlayerDetails(report.actors, null)).toEqual(report.actors);
  });
});

describe('readTableEntries', () => {
  it('reads the standard data.entries shape', () => {
    expect(readTableEntries(DAMAGE_TABLE_RAW)).toHaveLength(4);
  });
  it('tolerates data being the array itself', () => {
    expect(readTableEntries({ data: [{ name: 'A' }, { name: 'B' }] })).toHaveLength(2);
  });
  it('tolerates a bare array', () => {
    expect(readTableEntries([{ name: 'A' }])).toHaveLength(1);
  });
  it('returns an empty array for junk instead of throwing', () => {
    expect(readTableEntries(null)).toEqual([]);
    expect(readTableEntries({ data: { nope: 1 } })).toEqual([]);
  });
});

describe('readAbilities', () => {
  const entry = DAMAGE_TABLE_RAW.data.entries[0]!;
  it('reads damage amounts', () => {
    const abilities = readAbilities(entry, 'amount');
    expect(abilities[0]).toMatchObject({ name: 'Mutilate', abilityId: 5374, total: 1_400_000, hits: 120 });
  });
  it('reads cast counts from the casts table shape', () => {
    const abilities = readAbilities({ abilities: [{ name: 'Kick', guid: 9003, total: 3 }] }, 'casts');
    expect(abilities[0]).toMatchObject({ name: 'Kick', casts: 3, total: null });
  });
});

describe('normalizeAbilities', () => {
  it('builds an id -> name dictionary', () => {
    const dict = normalizeAbilities(REPORT_RAW.masterData);
    expect(dict.get(9001)?.name).toBe('Shattering Bellow');
    expect(dict.size).toBe(3);
  });
});
