import { describe, expect, it } from 'vitest';
import {
  buildDelta, buildSpecComparisons, comparePulls, neutralDelta, SPEC_COMPARISON_WARNING,
} from '@/lib/analysis/comparePulls';
import { EvidenceBuilder, compact, INSUFFICIENT_EVIDENCE, DEFENSIVE_INCONCLUSIVE, sortBySeverity } from '@/lib/analysis/evidence';
import type { FightAnalysis, PlayerFightStats } from '@/lib/types';
import { formatCompact, formatNumber } from '@/lib/format';

describe('buildDelta', () => {
  it('marks an increase as improved when higher is better', () => {
    const d = buildDelta({ metric: 'DPS', a: 100, b: 120, higherIsBetter: true, format: formatNumber });
    expect(d.direction).toBe('improved');
    expect(d.delta).toBe(20);
    expect(d.deltaPct).toBeCloseTo(20);
  });

  it('marks an increase as regressed when lower is better', () => {
    const d = buildDelta({ metric: 'Deaths', a: 2, b: 5, higherIsBetter: false, format: formatNumber });
    expect(d.direction).toBe('regressed');
  });

  it('marks an exact match as unchanged', () => {
    const d = buildDelta({ metric: 'Deaths', a: 3, b: 3, higherIsBetter: false, format: formatNumber });
    expect(d.direction).toBe('unchanged');
    expect(d.delta).toBe(0);
  });

  it('treats sub-tolerance movement on continuous metrics as unchanged', () => {
    const d = buildDelta({
      metric: 'DPS', a: 100_000, b: 100_500, higherIsBetter: true, format: formatCompact, tolerance: 0.02,
    });
    expect(d.direction).toBe('unchanged');
  });

  it('still reports movement beyond the tolerance band', () => {
    const d = buildDelta({
      metric: 'DPS', a: 100_000, b: 110_000, higherIsBetter: true, format: formatCompact, tolerance: 0.02,
    });
    expect(d.direction).toBe('improved');
  });

  it('reports unknown values as unchanged with null deltas', () => {
    const d = buildDelta({ metric: 'Boss %', a: null, b: 20, higherIsBetter: false, format: formatNumber });
    expect(d.direction).toBe('unchanged');
    expect(d.delta).toBeNull();
    expect(d.aLabel).toBe('—');
  });

  it('avoids dividing by zero for a percentage change from zero', () => {
    const d = buildDelta({ metric: 'Deaths', a: 0, b: 3, higherIsBetter: false, format: formatNumber });
    expect(d.deltaPct).toBeNull();
    expect(d.direction).toBe('regressed');
  });
});

function player(overrides: Partial<PlayerFightStats>): PlayerFightStats {
  return {
    actorId: 1, name: 'P', className: 'Rogue', spec: 'Assassination', role: 'melee',
    damage: 0, dps: 0, healing: 0, hps: 0, damageTaken: 0, deaths: 0, interrupts: 0, dispels: 0,
    activeTimeMs: null, activeTimePct: null, damageShare: 0, healingShare: 0,
    damageAbilities: [], healingAbilities: [], casts: [],
    ...overrides,
  };
}

function analysis(overrides: {
  fightId: number; kill: boolean; boss: number | null; attempt: number;
  players: PlayerFightStats[]; deaths: number; firstDeathMs: number | null;
}): FightAnalysis {
  return {
    reportCode: 'aBcD1234efGH5678',
    reportTitle: 'T',
    fight: {
      id: overrides.fightId, name: 'Boss', encounterId: 1, difficulty: 5, difficultyLabel: 'Mythic',
      startTime: 0, endTime: 200_000, durationMs: 200_000, kill: overrides.kill,
      bossPercentage: overrides.boss, fightPercentage: overrides.boss, friendlyPlayerIds: [],
      isEncounter: true, attemptNumber: overrides.attempt, attemptTotal: 2,
    },
    summary: {
      fightId: overrides.fightId, encounter: 'Boss', difficultyLabel: 'Mythic',
      durationMs: 200_000, durationLabel: '3m 20s', kill: overrides.kill, bossPercentage: overrides.boss,
      raidDamage: 0, raidDps: overrides.players.reduce((s, p) => s + p.dps, 0),
      raidHealing: 0, raidHps: 0, raidDamageTaken: 0,
      deaths: overrides.deaths, interrupts: 0, dispels: 0, playerCount: overrides.players.length,
      firstDeathMs: overrides.firstDeathMs,
      firstDeathLabel: null, firstDeathPlayer: null,
      composition: { tanks: 0, healers: 0, melee: 0, ranged: 0, unknown: 0 },
    },
    players: overrides.players,
    deaths: [], damageTakenSources: [], timeline: [], findings: [],
    coverage: { damage: true, healing: true, damageTaken: true, casts: true, interrupts: true, dispels: true, deaths: true, deathEvents: true, notes: [] },
    reportLink: 'https://www.warcraftlogs.com/reports/aBcD1234efGH5678#fight=1',
    source: 'warcraftlogs',
  };
}

describe('comparePulls', () => {
  const pullA = analysis({
    fightId: 2, kill: false, boss: 31.5, attempt: 1, deaths: 5, firstDeathMs: 40_000,
    players: [player({ name: 'Stabby', dps: 100_000 }), player({ name: 'Boomy', dps: 90_000 })],
  });
  const pullB = analysis({
    fightId: 3, kill: true, boss: 0, attempt: 2, deaths: 1, firstDeathMs: 150_000,
    players: [player({ name: 'Stabby', dps: 120_000 }), player({ name: 'Boomy', dps: 89_000 })],
  });
  const comparison = comparePulls(pullA, pullB);

  it('labels both pulls', () => {
    expect(comparison.a.label).toBe('Pull 1 · Wipe');
    expect(comparison.b.label).toBe('Pull 2 · Kill');
  });

  it('reports fewer deaths as improved', () => {
    expect(comparison.metrics.find((m) => m.metric === 'Deaths')!.direction).toBe('improved');
  });

  it('reports lower boss percentage as improved', () => {
    expect(comparison.metrics.find((m) => m.metric === 'Boss % remaining')!.direction).toBe('improved');
  });

  it('reports a later first death as improved', () => {
    expect(comparison.metrics.find((m) => m.metric === 'First death')!.direction).toBe('improved');
  });

  it('computes per-player deltas only for players in both pulls', () => {
    expect(comparison.playerDeltas).toHaveLength(2);
    expect(comparison.playerDeltas.find((p) => p.name === 'Stabby')!.dps.direction).toBe('improved');
    // 90k -> 89k is a 1.1% drop, inside the noise band.
    expect(comparison.playerDeltas.find((p) => p.name === 'Boomy')!.dps.direction).toBe('unchanged');
  });

  it('narrates the kill', () => {
    expect(comparison.narrative.join(' ')).toContain('killed the boss');
  });

  it('narrates from real deltas only', () => {
    expect(comparison.narrative.join(' ')).toContain('4 fewer deaths');
  });

  it('withholds a duration verdict when one pull is a kill and the other is not', () => {
    // A 5-minute kill is not "worse" than a 3-minute wipe.
    const duration = comparison.metrics.find((m) => m.metric === 'Duration')!;
    expect(duration.direction).toBe('unchanged');
    // The numbers are still reported.
    expect(duration.delta).not.toBeNull();
  });

  it('gives duration a verdict when both pulls ended the same way', () => {
    const wipeA = analysis({
      fightId: 2, kill: false, boss: 40, attempt: 1, deaths: 5, firstDeathMs: 30_000, players: [],
    });
    const wipeB = analysis({
      fightId: 3, kill: false, boss: 20, attempt: 2, deaths: 4, firstDeathMs: 60_000, players: [],
    });
    wipeB.summary.durationMs = 300_000; // survived longer = progress on a wipe
    const c = comparePulls(wipeA, wipeB);
    expect(c.metrics.find((m) => m.metric === 'Duration')!.direction).toBe('improved');
  });

  it('compares damage taken as a rate, not a duration-biased total', () => {
    const metric = comparison.metrics.find((m) => m.metric === 'Damage taken /s');
    expect(metric).toBeDefined();
    expect(comparison.metrics.find((m) => m.metric === 'Raid damage taken')).toBeUndefined();
  });

  it('does not call a longer pull worse purely for accumulating more damage', () => {
    // Same damage-per-second, but pull B runs 50% longer.
    const shortPull = analysis({
      fightId: 2, kill: false, boss: 30, attempt: 1, deaths: 1, firstDeathMs: null, players: [],
    });
    shortPull.summary.durationMs = 200_000;
    shortPull.summary.raidDamageTaken = 20_000_000;

    const longPull = analysis({
      fightId: 3, kill: false, boss: 30, attempt: 2, deaths: 1, firstDeathMs: null, players: [],
    });
    longPull.summary.durationMs = 300_000;
    longPull.summary.raidDamageTaken = 30_000_000; // identical rate

    const c = comparePulls(shortPull, longPull);
    expect(c.metrics.find((m) => m.metric === 'Damage taken /s')!.direction).toBe('unchanged');
  });
});

describe('neutralDelta', () => {
  it('reports the numbers but no verdict', () => {
    const d = neutralDelta({ metric: 'Duration', a: 100, b: 200, format: formatNumber });
    expect(d.direction).toBe('unchanged');
    expect(d.delta).toBe(100);
    expect(d.aLabel).toBe('100');
    expect(d.bLabel).toBe('200');
  });
});

describe('buildSpecComparisons', () => {
  it('groups only players who share a spec', () => {
    const a = analysis({
      fightId: 1, kill: false, boss: 10, attempt: 1, deaths: 0, firstDeathMs: null,
      players: [
        player({ name: 'RogueA', className: 'Rogue', spec: 'Assassination', dps: 100 }),
        player({ name: 'RogueB', className: 'Rogue', spec: 'Assassination', dps: 90 }),
        player({ name: 'Mage', className: 'Mage', spec: 'Frost', role: 'ranged', dps: 95 }),
      ],
    });
    const groups = buildSpecComparisons(a);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.spec).toBe('Assassination');
    expect(groups[0]!.players.map((p) => p.name)).toEqual(['RogueA', 'RogueB']);
  });

  it('always carries the raid-assignment warning', () => {
    const a = analysis({
      fightId: 1, kill: false, boss: 10, attempt: 1, deaths: 0, firstDeathMs: null,
      players: [
        player({ name: 'A', spec: 'Assassination' }),
        player({ name: 'B', spec: 'Assassination' }),
      ],
    });
    expect(buildSpecComparisons(a)[0]!.warning).toBe(SPEC_COMPARISON_WARNING);
    expect(SPEC_COMPARISON_WARNING).toBe('Numbers require raid-assignment context.');
  });

  it('does not compare across different specs', () => {
    const a = analysis({
      fightId: 1, kill: false, boss: 10, attempt: 1, deaths: 0, firstDeathMs: null,
      players: [
        player({ name: 'A', className: 'Rogue', spec: 'Assassination' }),
        player({ name: 'B', className: 'Rogue', spec: 'Subtlety' }),
      ],
    });
    expect(buildSpecComparisons(a)).toHaveLength(0);
  });
});

describe('EvidenceBuilder', () => {
  const builder = new EvidenceBuilder({ reportCode: 'aBcD1234efGH5678', fightId: 7 });

  it('stamps the source and a link back to the fight', () => {
    const e = builder.build({ category: 'damage', metric: 'DPS', value: '10.0K', rawValue: 10_000 });
    expect(e.source).toBe('WARCRAFT LOGS');
    expect(e.reportLink).toBe('https://www.warcraftlogs.com/reports/aBcD1234efGH5678#fight=7');
    expect(e.rawValue).toBe(10_000);
  });

  it('formats a timestamp label alongside the raw milliseconds', () => {
    const e = builder.build({ category: 'death', metric: 'Death', value: 'x', timestampMs: 73_000 });
    expect(e.timestampLabel).toBe('1:13');
    expect(e.timestampMs).toBe(73_000);
  });

  it('issues unique ids', () => {
    const a = builder.build({ category: 'damage', metric: 'm', value: 'v' });
    const b = builder.build({ category: 'damage', metric: 'm', value: 'v' });
    expect(a.id).not.toBe(b.id);
  });

  it('omits optional fields rather than emitting empty ones', () => {
    const e = builder.build({ category: 'damage', metric: 'm', value: 'v' });
    expect(e).not.toHaveProperty('player');
    expect(e).not.toHaveProperty('timestampMs');
    expect(e).not.toHaveProperty('rawValue');
  });

  it('refuses to build a finding with no evidence', () => {
    expect(builder.finding({ severity: 'high', title: 't', finding: 'f', evidence: [] })).toBeNull();
  });

  it('builds a finding when evidence is present', () => {
    const e = builder.build({ category: 'damage', metric: 'm', value: 'v' });
    const f = builder.finding({ severity: 'high', title: 't', finding: 'f', evidence: [e] });
    expect(f).not.toBeNull();
    expect(f!.evidence).toHaveLength(1);
  });
});

describe('evidence helpers', () => {
  it('drops nulls', () => {
    expect(compact([null, { severity: 'high' } as never, null])).toHaveLength(1);
  });

  it('sorts by severity', () => {
    const sorted = sortBySeverity([
      { severity: 'info' } as never, { severity: 'high' } as never, { severity: 'medium' } as never,
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(['high', 'medium', 'info']);
  });

  it('exposes the exact required wording for unprovable claims', () => {
    expect(INSUFFICIENT_EVIDENCE).toBe('Insufficient evidence.');
    expect(DEFENSIVE_INCONCLUSIVE).toBe(
      'Defensive usage could not be conclusively evaluated from the available dataset.',
    );
  });
});
