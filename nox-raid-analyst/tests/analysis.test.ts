import { describe, expect, it } from 'vitest';
import { applyPlayerDetails, normalizeAbilities, normalizeReport, readTableEntries } from '@/lib/warcraftlogs/normalize';
import { buildPlayerStats, perSecond, resolveFightRoster, share } from '@/lib/analysis/playerEngine';
import {
  attachDeathWindow,
  buildDeaths,
  DEATH_WINDOW_MS,
  findDeathClusters,
  largestHit,
  toFightRelative,
} from '@/lib/analysis/deathAnalyzer';
import { buildDamageSources, buildFindings, buildRaidSummary, buildTimeline } from '@/lib/analysis/raidEngine';
import { EvidenceBuilder } from '@/lib/analysis/evidence';
import { roleForSpec } from '@/lib/analysis/roles';
import type { DataCoverage } from '@/lib/types';
import {
  CASTS_TABLE_RAW,
  DAMAGE_TABLE_RAW,
  DAMAGE_TAKEN_TABLE_RAW,
  DEATHS_TABLE_RAW,
  DEATH_WINDOW_EVENTS,
  DISPELS_TABLE_RAW,
  DISPEL_EVENTS,
  HEALING_TABLE_RAW,
  INTERRUPTS_TABLE_RAW,
  INTERRUPT_EVENTS,
  PLAYER_DETAILS_RAW,
  REPORT_RAW,
} from './fixtures/wcl';

const report = normalizeReport(REPORT_RAW)!;
const actors = applyPlayerDetails(report.actors, PLAYER_DETAILS_RAW);
const abilities = normalizeAbilities(REPORT_RAW.masterData);
const fight = report.fights.find((f) => f.id === 2)!; // 240s wipe at 31.5%

const tables = {
  damageDone: readTableEntries(DAMAGE_TABLE_RAW),
  healing: readTableEntries(HEALING_TABLE_RAW),
  damageTaken: readTableEntries(DAMAGE_TAKEN_TABLE_RAW),
  casts: readTableEntries(CASTS_TABLE_RAW),
  interrupts: readTableEntries(INTERRUPTS_TABLE_RAW),
  dispels: readTableEntries(DISPELS_TABLE_RAW),
};

const deaths = buildDeaths({ entries: readTableEntries(DEATHS_TABLE_RAW), actors, fight, abilities });
const deathsByActor = new Map(deaths.map((d) => [d.actorId, 1]));
const players = buildPlayerStats({ fight, actors, tables, deathsByActor });

describe('rate maths', () => {
  it('computes a per-second rate over fight duration', () => {
    // 2,400,000 damage over 240s = 10,000 DPS
    expect(perSecond(2_400_000, 240_000)).toBe(10_000);
  });
  it('returns 0 for a zero-length fight instead of dividing by zero', () => {
    expect(perSecond(1000, 0)).toBe(0);
  });
  it('computes a bounded share', () => {
    expect(share(25, 100)).toBe(25);
    expect(share(5, 0)).toBe(0);
    expect(share(200, 100)).toBe(100);
  });
});

describe('roleForSpec', () => {
  it('distinguishes same-named specs across classes', () => {
    expect(roleForSpec('Mage', 'Frost')).toBe('ranged');
    expect(roleForSpec('DeathKnight', 'Frost')).toBe('melee');
    expect(roleForSpec('Paladin', 'Holy')).toBe('healer');
    expect(roleForSpec('Priest', 'Holy')).toBe('healer');
  });
  it('handles spaced spec names', () => {
    expect(roleForSpec('Hunter', 'Beast Mastery')).toBe('ranged');
  });
  it('returns unknown rather than guessing DPS', () => {
    expect(roleForSpec('Warrior', 'Nonsense')).toBe('unknown');
    expect(roleForSpec(null, 'Fury')).toBe('unknown');
  });
});

describe('buildPlayerStats', () => {
  const stabby = players.find((p) => p.name === 'Stabby')!;
  const healbot = players.find((p) => p.name === 'Healbot')!;

  it('computes DPS from damage over fight duration', () => {
    expect(stabby.damage).toBe(2_400_000);
    expect(stabby.dps).toBe(10_000);
  });

  it('computes HPS for healers', () => {
    expect(healbot.healing).toBe(1_800_000);
    expect(healbot.hps).toBe(7_500);
  });

  it('computes contribution shares that sum to 100', () => {
    const total = players.reduce((s, p) => s + p.damageShare, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('merges utility counts from their own tables', () => {
    expect(stabby.interrupts).toBe(3);
    expect(healbot.dispels).toBe(2);
  });

  it('reads damage taken per player', () => {
    expect(players.find((p) => p.name === 'Tankadin')!.damageTaken).toBe(900_000);
  });

  it('computes active time percentage', () => {
    expect(stabby.activeTimeMs).toBe(228_000);
    expect(stabby.activeTimePct).toBeCloseTo(95, 5);
  });

  it('leaves active time null when the log does not record it', () => {
    expect(players.find((p) => p.name === 'Boomy')!.activeTimeMs).toBe(216_000);
    const noActive = buildPlayerStats({
      fight,
      actors,
      tables: { ...tables, damageDone: [{ id: 12, name: 'Stabby', total: 100 }], healing: [] },
      deathsByActor: new Map(),
    });
    expect(noActive.find((p) => p.name === 'Stabby')!.activeTimePct).toBeNull();
  });

  it('carries role and spec through to the row', () => {
    expect(stabby.role).toBe('melee');
    expect(stabby.spec).toBe('Assassination');
  });

  it('attaches ability breakdowns sorted by amount', () => {
    expect(stabby.damageAbilities[0]!.name).toBe('Mutilate');
    expect(stabby.casts[0]).toMatchObject({ name: 'Mutilate', casts: 120 });
  });

  it('scopes the roster to the fight participants', () => {
    const roster = resolveFightRoster(fight, actors, tables);
    expect(roster.map((a) => a.name).sort()).toEqual(['Boomy', 'Healbot', 'Stabby', 'Tankadin']);
  });
});

describe('death analysis', () => {
  it('orders deaths and converts to fight-relative time', () => {
    expect(deaths.map((d) => d.name)).toEqual(['Boomy', 'Stabby', 'Healbot']);
    expect(deaths[0]!.timestampMs).toBe(60_000); // 160_000 - fight start 100_000
    expect(deaths[0]!.timestampLabel).toBe('1:00');
    expect(deaths[0]!.order).toBe(1);
  });

  it('records the killing blow from the table', () => {
    expect(deaths[0]!.killingBlow?.abilityName).toBe('Shattering Bellow');
  });

  it('marks the window unavailable until events are attached', () => {
    expect(deaths[0]!.windowUnavailable).toBe(true);
    expect(deaths[0]!.precedingDamage).toEqual([]);
  });

  it('handles both report-relative and already-relative timestamps', () => {
    expect(toFightRelative(160_000, fight)).toBe(60_000);
    expect(toFightRelative(60_000, fight)).toBe(60_000);
  });

  it('reconstructs the pre-death window and filters other players out', () => {
    const withWindow = attachDeathWindow(deaths[0]!, DEATH_WINDOW_EVENTS, fight, abilities);
    expect(withWindow.windowUnavailable).toBe(false);
    expect(withWindow.precedingDamage).toHaveLength(3); // the 4th targets another player
    expect(withWindow.damageInWindow).toBe(445_000);
    expect(withWindow.windowMs).toBe(DEATH_WINDOW_MS);
  });

  it('resolves ability names for window events from the dictionary', () => {
    const withWindow = attachDeathWindow(deaths[0]!, DEATH_WINDOW_EVENTS, fight, abilities);
    expect(withWindow.precedingDamage.at(-1)!.abilityName).toBe('Shattering Bellow');
  });

  it('identifies the largest hit in the window', () => {
    const withWindow = attachDeathWindow(deaths[0]!, DEATH_WINDOW_EVENTS, fight, abilities);
    expect(largestHit(withWindow)!.amount).toBe(400_000);
  });

  it('returns null for a largest hit when no window exists', () => {
    expect(largestHit(deaths[0]!)).toBeNull();
  });

  it('finds clusters of deaths within the window', () => {
    const clusters = findDeathClusters(deaths);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.map((d) => d.name)).toEqual(['Boomy', 'Stabby']);
  });
});

describe('buildRaidSummary', () => {
  const summary = buildRaidSummary({ fight, players, deaths });

  it('totals raid output', () => {
    expect(summary.raidDamage).toBe(4_080_000);
    expect(summary.raidDps).toBe(17_000);
    expect(summary.raidHealing).toBe(2_000_000);
  });

  it('reports the first death', () => {
    expect(summary.firstDeathPlayer).toBe('Boomy');
    expect(summary.firstDeathLabel).toBe('1:00');
  });

  it('counts composition by role', () => {
    expect(summary.composition).toEqual({ tanks: 1, healers: 1, melee: 1, ranged: 1, unknown: 0 });
  });

  it('carries the wipe result through', () => {
    expect(summary.kill).toBe(false);
    expect(summary.bossPercentage).toBe(31.5);
  });
});

describe('buildDamageSources', () => {
  const sources = buildDamageSources(tables.damageTaken);

  it('aggregates the same ability across players', () => {
    const bellow = sources.find((s) => s.abilityName === 'Shattering Bellow')!;
    expect(bellow.total).toBe(1_000_000); // 700k tank + 300k rogue
    expect(bellow.hits).toBe(10);
  });

  it('computes shares over total damage taken', () => {
    const bellow = sources.find((s) => s.abilityName === 'Shattering Bellow')!;
    expect(bellow.share).toBeCloseTo(83.333, 2);
  });

  it('sorts by total descending', () => {
    expect(sources[0]!.abilityName).toBe('Shattering Bellow');
  });
});

describe('buildTimeline', () => {
  const timeline = buildTimeline({
    fight,
    deaths: deaths.map((d) => attachDeathWindow(d, DEATH_WINDOW_EVENTS, fight, abilities)),
    interruptEvents: INTERRUPT_EVENTS,
    dispelEvents: DISPEL_EVENTS,
    actors,
    abilityNameFor: (id) => (id === null ? null : (abilities.get(id)?.name ?? null)),
    toRelative: (t) => toFightRelative(t, fight),
  });

  it('is ordered by timestamp', () => {
    const times = timeline.map((e) => e.timestampMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('includes a multi-death cluster entry', () => {
    expect(timeline.some((e) => e.kind === 'multi-death')).toBe(true);
  });

  it('names the interrupted spell', () => {
    const interrupt = timeline.find((e) => e.kind === 'interrupt')!;
    expect(interrupt.title).toBe('Shattering Bellow interrupted');
    expect(interrupt.players).toEqual(['Stabby']);
  });

  it('flags a burst-damage death', () => {
    const spike = timeline.find((e) => e.kind === 'damage-spike');
    expect(spike?.detail).toContain('Shattering Bellow');
  });

  it('always ends with the fight result', () => {
    expect(timeline.at(-1)!.kind).toBe('fight-end');
    expect(timeline.at(-1)!.title).toBe('Wipe');
  });
});

describe('buildFindings', () => {
  const coverage: DataCoverage = {
    damage: true, healing: true, damageTaken: true, casts: true,
    interrupts: true, dispels: true, deaths: true, deathEvents: true, notes: [],
  };
  const summary = buildRaidSummary({ fight, players, deaths });
  const findings = buildFindings({
    fight,
    summary,
    players,
    deaths,
    damageSources: buildDamageSources(tables.damageTaken),
    coverage,
    evidence: new EvidenceBuilder({ reportCode: report.code, fightId: fight.id }),
  });

  it('produces findings', () => {
    expect(findings.length).toBeGreaterThan(0);
  });

  it('attaches evidence to every finding', () => {
    for (const finding of findings) {
      expect(finding.evidence.length).toBeGreaterThan(0);
      for (const evidence of finding.evidence) {
        expect(evidence.source).toBe('WARCRAFT LOGS');
        expect(evidence.reportLink).toContain(report.code);
        expect(evidence.metric).toBeTruthy();
      }
    }
  });

  it('flags the early first death', () => {
    // Boomy dies 60s into a 240s pull = 25%, inside the "early" band.
    expect(findings.some((f) => f.title === 'Early first death')).toBe(true);
  });

  it('flags the death cluster', () => {
    expect(findings.some((f) => f.title.includes('deaths within'))).toBe(true);
  });

  it('flags the dominant damage source', () => {
    expect(findings.some((f) => f.title.includes('Shattering Bellow'))).toBe(true);
  });

  it('sorts most severe first', () => {
    const rank = { high: 0, medium: 1, low: 2, info: 3 } as const;
    const ranks = findings.map((f) => rank[f.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('does not claim a defensive should have been used', () => {
    const text = JSON.stringify(findings).toLowerCase();
    expect(text).not.toContain('should have used');
  });
});
