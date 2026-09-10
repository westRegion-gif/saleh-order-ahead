/**
 * EvidenceBuilder — the provenance layer.
 *
 * Every claim NOX makes must be constructed through this module, so each one
 * carries the player, metric, value, timestamp and a deep link back to the
 * originating Warcraft Logs fight. If a fact cannot be expressed as Evidence,
 * it does not get shown.
 */

import type { Evidence, EvidenceCategory, Finding, Severity } from '@/lib/types';
import { formatTimestamp } from '@/lib/format';
import { warcraftLogsLink } from '@/lib/warcraftlogs/parseReport';

export interface EvidenceContext {
  reportCode: string;
  fightId: number;
}

export interface EvidenceInput {
  category: EvidenceCategory;
  metric: string;
  value: string;
  rawValue?: number;
  player?: string;
  ability?: string;
  timestampMs?: number;
}

export class EvidenceBuilder {
  private seq = 0;
  private readonly link: string;

  constructor(private readonly context: EvidenceContext) {
    this.link = warcraftLogsLink(context.reportCode, context.fightId);
  }

  /** Build one traceable fact. */
  build(input: EvidenceInput): Evidence {
    this.seq += 1;
    const evidence: Evidence = {
      id: `ev-${this.context.fightId}-${this.seq}`,
      source: 'WARCRAFT LOGS',
      category: input.category,
      metric: input.metric,
      value: input.value,
      reportLink: this.link,
    };
    if (input.rawValue !== undefined && Number.isFinite(input.rawValue)) {
      evidence.rawValue = input.rawValue;
    }
    if (input.player) evidence.player = input.player;
    if (input.ability) evidence.ability = input.ability;
    if (input.timestampMs !== undefined && Number.isFinite(input.timestampMs)) {
      evidence.timestampMs = input.timestampMs;
      evidence.timestampLabel = formatTimestamp(input.timestampMs);
    }
    return evidence;
  }

  /** Build a finding. Findings with no evidence are rejected by construction. */
  finding(args: {
    severity: Severity;
    title: string;
    finding: string;
    evidence: Evidence[];
    recommendation?: string | null;
  }): Finding | null {
    if (args.evidence.length === 0) return null;
    return {
      severity: args.severity,
      title: args.title,
      finding: args.finding,
      evidence: args.evidence,
      recommendation: args.recommendation ?? null,
    };
  }
}

/** Phrase used verbatim wherever the dataset cannot support a conclusion. */
export const INSUFFICIENT_EVIDENCE = 'Insufficient evidence.';

/**
 * Standard wording for the defensive-cooldown question. NOX can see that a
 * defensive was *not* used, but cannot see whether it was *available* without
 * full cooldown tracking, so it must not accuse a player of wasting one.
 */
export const DEFENSIVE_INCONCLUSIVE =
  'Defensive usage could not be conclusively evaluated from the available dataset.';

export function sortBySeverity(findings: Finding[]): Finding[] {
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Drop nulls produced by `EvidenceBuilder.finding`. */
export function compact(findings: (Finding | null)[]): Finding[] {
  return findings.filter((f): f is Finding => f !== null);
}
