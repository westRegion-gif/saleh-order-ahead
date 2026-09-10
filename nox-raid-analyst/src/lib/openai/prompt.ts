/**
 * The AI layer's contract.
 *
 * The model receives a compact, already-computed analysis payload — never the
 * raw event stream — and is asked only to interpret it. Every number it cites
 * must already exist in the payload.
 */

import type { FightAnalysis } from '@/lib/types';
import { formatCompact, formatPercent } from '@/lib/format';

export const SYSTEM_PROMPT = `You are the analysis engine behind NOX Raid Analyst, a World of Warcraft raid-coaching tool used by Mythic progression guilds.

You are given a STRUCTURED ANALYSIS PAYLOAD that was computed deterministically from real Warcraft Logs data. Your job is to INTERPRET that evidence for a raid leader. You are not a calculator and you are not a lore source.

ABSOLUTE RULES — violating any of these makes your output worthless:
1. NEVER invent events, casts, deaths, damage numbers, timestamps or player names. If it is not in the payload, it did not happen as far as you are concerned.
2. NEVER invent boss mechanics or ability behaviour. You may name an ability ONLY if that exact ability name appears in the payload. Do not explain what a mechanic "normally" does.
3. NEVER claim a player failed to use a defensive or cooldown. The payload cannot prove a cooldown was available. If asked to assess this, say exactly: "Defensive usage could not be conclusively evaluated from the available dataset."
4. NEVER rank players by raw DPS or HPS alone. Account for role, specialization, fight assignment, active time and death timing.
5. NEVER compare players of different specializations as though raw output determines quality.
6. When the evidence does not support a conclusion, write exactly: "Insufficient evidence." Do not speculate to fill a section.
7. Every finding MUST cite evidence drawn from the payload. Each evidence item must use values that appear verbatim in the payload.
8. Do not assign scores, grades, percentile ranks or letter ratings. They do not exist in the payload.
9. Prefer explaining a shared cause over blaming individuals, especially when several players died together.
10. Be concise and specific. A raid leader reads this between pulls.

TONE: direct, technical, non-judgemental. You are a coach reviewing tape, not a scoreboard.

OUTPUT: respond with a single valid JSON object only. No markdown, no code fences, no commentary outside the JSON.

JSON SHAPE:
{
  "pullSummary": string,
  "keyFailurePoints": Finding[],
  "whatWentWell": Finding[],
  "deathAnalysis": Finding[],
  "mechanicalIssues": Finding[],
  "damageAnalysis": Finding[],
  "healingAnalysis": Finding[],
  "utilityAnalysis": Finding[],
  "playerCoaching": [{ "player": string, "keepDoing": Finding[], "fixNext": Finding[], "watch": Finding[] }],
  "nextPullPriorities": string[]
}

Finding = {
  "severity": "high" | "medium" | "low" | "info",
  "title": string,
  "finding": string,
  "evidence": [{ "timestamp": string|null, "player": string|null, "metric": string, "value": string }],
  "recommendation": string|null
}

Every Finding must contain at least one evidence item. Limit playerCoaching to at most 6 players — those the evidence actually says something about. Limit nextPullPriorities to at most 5 items.`;

/**
 * Compact the full analysis into the payload the model sees.
 *
 * This is deliberately lossy: per-player ability lists are truncated and raw
 * events are excluded entirely. The goal is enough evidence to interpret,
 * without shipping a combat log into a prompt.
 */
export function buildAnalysisPayload(analysis: FightAnalysis) {
  return {
    report: {
      code: analysis.reportCode,
      title: analysis.reportTitle,
    },
    fight: {
      encounter: analysis.fight.name,
      difficulty: analysis.fight.difficultyLabel,
      attemptNumber: analysis.fight.attemptNumber,
      attemptTotal: analysis.fight.attemptTotal,
      result: analysis.fight.kill === true ? 'kill' : analysis.fight.kill === false ? 'wipe' : 'unknown',
      durationSeconds: Math.round(analysis.fight.durationMs / 1000),
      bossPercentRemaining: analysis.fight.bossPercentage,
    },
    raidSummary: {
      raidDps: Math.round(analysis.summary.raidDps),
      raidHps: Math.round(analysis.summary.raidHps),
      raidDamageTaken: analysis.summary.raidDamageTaken,
      deaths: analysis.summary.deaths,
      interrupts: analysis.summary.interrupts,
      dispels: analysis.summary.dispels,
      playerCount: analysis.summary.playerCount,
      composition: analysis.summary.composition,
      firstDeath: analysis.summary.firstDeathPlayer
        ? { player: analysis.summary.firstDeathPlayer, at: analysis.summary.firstDeathLabel }
        : null,
    },
    players: analysis.players.map((p) => ({
      name: p.name,
      class: p.className,
      spec: p.spec,
      role: p.role,
      dps: Math.round(p.dps),
      hps: Math.round(p.hps),
      damage: p.damage,
      healing: p.healing,
      damageTaken: p.damageTaken,
      deaths: p.deaths,
      interrupts: p.interrupts,
      dispels: p.dispels,
      activeTimePercent: p.activeTimePct === null ? null : Math.round(p.activeTimePct),
      damageSharePercent: Math.round(p.damageShare * 10) / 10,
      topAbilities: p.damageAbilities.slice(0, 4).map((a) => ({ name: a.name, total: a.total })),
      topCasts: p.casts.slice(0, 6).map((a) => ({ name: a.name, casts: a.casts })),
    })),
    deaths: analysis.deaths.map((d) => ({
      order: d.order,
      player: d.name,
      role: d.role,
      spec: d.spec,
      at: d.timestampLabel,
      killingBlow: d.killingBlow?.abilityName ?? null,
      damageTakenInFinalSeconds: d.windowUnavailable ? null : d.damageInWindow,
      windowSeconds: d.windowMs / 1000,
      lastHits: d.precedingDamage.slice(-5).map((e) => ({
        at: e.timestampLabel,
        ability: e.abilityName,
        amount: e.amount,
      })),
      // Explicit so the model does not read a missing window as "no damage".
      windowAvailable: !d.windowUnavailable,
    })),
    incomingDamageSources: analysis.damageTakenSources.map((s) => ({
      ability: s.abilityName,
      total: s.total,
      sharePercent: Math.round(s.share * 10) / 10,
      hits: s.hits,
    })),
    timeline: analysis.timeline.map((e) => ({
      at: e.timestampLabel,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      players: e.players,
    })),
    deterministicFindings: analysis.findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      finding: f.finding,
      evidence: f.evidence.map((e) => ({
        timestamp: e.timestampLabel ?? null,
        player: e.player ?? null,
        metric: e.metric,
        value: e.value,
      })),
    })),
    dataCoverage: {
      ...analysis.coverage,
      // Tell the model plainly what it must not infer from.
      caveat:
        'A false flag means that dataset could not be retrieved. Do not interpret a missing dataset as a zero or as evidence of anything.',
    },
  };
}

/** A short human-readable header, useful for logging and for the AI preamble. */
export function describeFight(analysis: FightAnalysis): string {
  const result = analysis.fight.kill === true ? 'Kill' : 'Wipe';
  const boss =
    analysis.fight.bossPercentage !== null ? ` at ${formatPercent(analysis.fight.bossPercentage)}` : '';
  return `${analysis.fight.name} (${analysis.fight.difficultyLabel ?? 'Unknown difficulty'}) — ${result}${boss}, ${analysis.summary.durationLabel}, ${formatCompact(analysis.summary.raidDps)} raid DPS`;
}
