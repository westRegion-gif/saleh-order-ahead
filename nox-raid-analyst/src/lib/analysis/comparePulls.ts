/**
 * Pull-to-pull comparison.
 *
 * Direction is decided by the real numeric difference only. A "tolerance" band
 * exists solely so that sub-noise movement on continuous metrics (DPS drifting
 * 0.4%) is reported as unchanged rather than dressed up as improvement; counts
 * such as deaths use an exact comparison.
 */

import type { FightAnalysis, MetricDelta, PullComparison, Role } from '@/lib/types';
import { formatCompact, formatDuration, formatNumber, formatPercent, formatTimestamp } from '@/lib/format';
import { perSecond } from './playerEngine';

export interface DeltaSpec {
  metric: string;
  a: number | null;
  b: number | null;
  higherIsBetter: boolean;
  format: (value: number) => string;
  /** Relative movement below this fraction counts as unchanged. 0 = exact. */
  tolerance?: number;
}

export function buildDelta(spec: DeltaSpec): MetricDelta {
  const { metric, a, b, higherIsBetter, format } = spec;
  const tolerance = spec.tolerance ?? 0;

  const known = a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b);
  const delta = known ? b - a : null;
  const deltaPct = known && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;

  let direction: MetricDelta['direction'] = 'unchanged';
  if (known && delta !== null && delta !== 0) {
    const withinTolerance =
      tolerance > 0 && deltaPct !== null && Math.abs(deltaPct) < tolerance * 100;
    if (!withinTolerance) {
      const better = higherIsBetter ? delta > 0 : delta < 0;
      direction = better ? 'improved' : 'regressed';
    }
  }

  return {
    metric,
    a,
    b,
    delta,
    deltaPct,
    direction,
    aLabel: a === null ? '—' : format(a),
    bLabel: b === null ? '—' : format(b),
    deltaLabel:
      delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))}`,
    higherIsBetter,
  };
}

const DPS_TOLERANCE = 0.02;

/**
 * A delta that reports the numbers but deliberately withholds a verdict,
 * for metrics whose meaning changes between the two pulls being compared.
 */
export function neutralDelta(spec: {
  metric: string;
  a: number | null;
  b: number | null;
  format: (value: number) => string;
}): MetricDelta {
  const base = buildDelta({ ...spec, higherIsBetter: true });
  return { ...base, direction: 'unchanged' };
}

export function comparePulls(a: FightAnalysis, b: FightAnalysis): PullComparison {
  // Kill-vs-wipe changes what several metrics even mean.
  const comparableOutcome = a.fight.kill === b.fight.kill;

  const metrics: MetricDelta[] = [
    // Duration only carries a direction when both pulls ended the same way.
    // A 5-minute kill is not "worse" than a 3-minute wipe, and a longer wipe
    // is progress, so a mixed pair is reported without a verdict.
    comparableOutcome
      ? buildDelta({
          metric: 'Duration',
          a: a.summary.durationMs,
          b: b.summary.durationMs,
          // Both wipes: surviving longer is progress. Both kills: faster is better.
          higherIsBetter: b.fight.kill !== true,
          format: formatDuration,
          tolerance: DPS_TOLERANCE,
        })
      : neutralDelta({
          metric: 'Duration',
          a: a.summary.durationMs,
          b: b.summary.durationMs,
          format: formatDuration,
        }),
    buildDelta({
      metric: 'Boss % remaining',
      a: a.summary.bossPercentage,
      b: b.summary.bossPercentage,
      higherIsBetter: false,
      format: (v) => formatPercent(v),
      tolerance: 0,
    }),
    buildDelta({
      metric: 'Raid DPS',
      a: a.summary.raidDps,
      b: b.summary.raidDps,
      higherIsBetter: true,
      format: formatCompact,
      tolerance: DPS_TOLERANCE,
    }),
    buildDelta({
      metric: 'Raid HPS',
      a: a.summary.raidHps,
      b: b.summary.raidHps,
      higherIsBetter: true,
      format: formatCompact,
      tolerance: DPS_TOLERANCE,
    }),
    buildDelta({
      metric: 'Deaths',
      a: a.summary.deaths,
      b: b.summary.deaths,
      higherIsBetter: false,
      format: formatNumber,
    }),
    buildDelta({
      metric: 'First death',
      a: a.summary.firstDeathMs,
      b: b.summary.firstDeathMs,
      // Dying later into the pull is the better outcome.
      higherIsBetter: true,
      format: formatTimestamp,
      tolerance: DPS_TOLERANCE,
    }),
    buildDelta({
      metric: 'Interrupts',
      a: a.summary.interrupts,
      b: b.summary.interrupts,
      higherIsBetter: true,
      format: formatNumber,
    }),
    buildDelta({
      metric: 'Dispels',
      a: a.summary.dispels,
      b: b.summary.dispels,
      higherIsBetter: true,
      format: formatNumber,
    }),
    // Rate, not total: cumulative damage taken scales with fight length, so
    // comparing raw totals across pulls of different duration is misleading.
    buildDelta({
      metric: 'Damage taken /s',
      a: perSecond(a.summary.raidDamageTaken, a.summary.durationMs),
      b: perSecond(b.summary.raidDamageTaken, b.summary.durationMs),
      higherIsBetter: false,
      format: formatCompact,
      tolerance: DPS_TOLERANCE,
    }),
  ];

  const playersA = new Map(a.players.map((p) => [p.name, p]));
  const playerDeltas: PullComparison['playerDeltas'] = [];

  for (const playerB of b.players) {
    const playerA = playersA.get(playerB.name);
    if (!playerA) continue;
    playerDeltas.push({
      name: playerB.name,
      role: playerB.role as Role,
      spec: playerB.spec,
      dps: buildDelta({
        metric: 'DPS',
        a: playerA.dps,
        b: playerB.dps,
        higherIsBetter: true,
        format: formatCompact,
        tolerance: DPS_TOLERANCE,
      }),
      hps: buildDelta({
        metric: 'HPS',
        a: playerA.hps,
        b: playerB.hps,
        higherIsBetter: true,
        format: formatCompact,
        tolerance: DPS_TOLERANCE,
      }),
      damageTaken: buildDelta({
        metric: 'Damage taken /s',
        a: perSecond(playerA.damageTaken, a.summary.durationMs),
        b: perSecond(playerB.damageTaken, b.summary.durationMs),
        higherIsBetter: false,
        format: formatCompact,
        tolerance: DPS_TOLERANCE,
      }),
      deaths: buildDelta({
        metric: 'Deaths',
        a: playerA.deaths,
        b: playerB.deaths,
        higherIsBetter: false,
        format: formatNumber,
      }),
    });
  }

  return {
    a: { fightId: a.fight.id, label: pullLabel(a), attemptNumber: a.fight.attemptNumber },
    b: { fightId: b.fight.id, label: pullLabel(b), attemptNumber: b.fight.attemptNumber },
    metrics,
    playerDeltas,
    narrative: buildNarrative(a, b, metrics),
  };
}

export function pullLabel(analysis: FightAnalysis): string {
  const attempt = analysis.fight.attemptNumber ? `Pull ${analysis.fight.attemptNumber}` : `Fight ${analysis.fight.id}`;
  const result = analysis.fight.kill === true ? 'Kill' : 'Wipe';
  return `${attempt} · ${result}`;
}

/**
 * "What changed between Pull X and Pull Y?" — assembled strictly from the
 * computed deltas, with no interpretation beyond direction.
 */
function buildNarrative(a: FightAnalysis, b: FightAnalysis, metrics: MetricDelta[]): string[] {
  const lines: string[] = [];

  const improved = metrics.filter((m) => m.direction === 'improved');
  const regressed = metrics.filter((m) => m.direction === 'regressed');

  if (a.fight.kill !== true && b.fight.kill === true) {
    lines.push(`${pullLabel(b)} killed the boss; ${pullLabel(a)} did not.`);
  }

  const boss = metrics.find((m) => m.metric === 'Boss % remaining');
  if (boss && boss.delta !== null && boss.delta !== 0) {
    lines.push(
      boss.delta < 0
        ? `The raid pushed the boss ${formatPercent(Math.abs(boss.delta))} further (${boss.aLabel} → ${boss.bLabel}).`
        : `The boss ended ${formatPercent(boss.delta)} higher than the previous pull (${boss.aLabel} → ${boss.bLabel}).`,
    );
  }

  const deaths = metrics.find((m) => m.metric === 'Deaths');
  if (deaths && deaths.delta !== null && deaths.delta !== 0) {
    lines.push(
      deaths.delta < 0
        ? `${Math.abs(deaths.delta)} fewer deaths (${deaths.aLabel} → ${deaths.bLabel}).`
        : `${deaths.delta} more deaths (${deaths.aLabel} → ${deaths.bLabel}).`,
    );
  }

  if (improved.length > 0) lines.push(`Improved: ${improved.map((m) => m.metric).join(', ')}.`);
  if (regressed.length > 0) lines.push(`Regressed: ${regressed.map((m) => m.metric).join(', ')}.`);
  if (improved.length === 0 && regressed.length === 0) {
    lines.push('No metric moved beyond measurement noise between these two pulls.');
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Same-spec comparison
// ---------------------------------------------------------------------------

export interface SpecComparison {
  spec: string;
  className: string | null;
  role: Role;
  players: {
    name: string;
    dps: number;
    hps: number;
    damage: number;
    healing: number;
    damageTaken: number;
    deaths: number;
    interrupts: number;
    dispels: number;
    activeTimePct: number | null;
    castCount: number | null;
  }[];
  /** Always shown — raw output alone does not establish player quality. */
  warning: string;
}

export const SPEC_COMPARISON_WARNING = 'Numbers require raid-assignment context.';

/** Group the roster by spec so like is compared with like, never across specs. */
export function buildSpecComparisons(analysis: FightAnalysis): SpecComparison[] {
  const groups = new Map<string, SpecComparison>();

  for (const player of analysis.players) {
    if (!player.spec || !player.className) continue;
    const key = `${player.className}-${player.spec}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        spec: player.spec,
        className: player.className,
        role: player.role,
        players: [],
        warning: SPEC_COMPARISON_WARNING,
      };
      groups.set(key, group);
    }
    group.players.push({
      name: player.name,
      dps: player.dps,
      hps: player.hps,
      damage: player.damage,
      healing: player.healing,
      damageTaken: player.damageTaken,
      deaths: player.deaths,
      interrupts: player.interrupts,
      dispels: player.dispels,
      activeTimePct: player.activeTimePct,
      castCount: player.casts.length > 0 ? player.casts.reduce((s, c) => s + (c.casts ?? 0), 0) : null,
    });
  }

  // Only groups with an actual peer are worth showing.
  return [...groups.values()].filter((g) => g.players.length >= 2);
}
