import { describe, expect, it } from 'vitest';
import { DEMO_REPORT_CODE, getDemoAnalysis, getDemoReport, isDemoCode } from '@/lib/demo/fixtures';
import { buildSpecComparisons } from '@/lib/analysis/comparePulls';

describe('demo dataset', () => {
  const report = getDemoReport();

  it('is flagged as demo data everywhere', () => {
    expect(report.source).toBe('demo');
    for (const fight of report.fights) {
      const analysis = getDemoAnalysis(fight.id);
      expect(analysis?.source, `fight ${fight.id}`).toBe('demo');
    }
  });

  it('is recognisable by its code', () => {
    expect(isDemoCode(DEMO_REPORT_CODE)).toBe(true);
    expect(isDemoCode('demoxxxxdemoxxxx')).toBe(true);
    expect(isDemoCode('aBcD1234efGH5678')).toBe(false);
  });

  it('carries a coverage note saying no request was made', () => {
    const analysis = getDemoAnalysis(report.fights[0]!.id)!;
    expect(analysis.coverage.notes.join(' ')).toContain('demo data');
  });

  it('builds a full 20-player roster with resolved roles', () => {
    expect(report.actors).toHaveLength(20);
    expect(report.actors.every((a) => a.roleConfirmed)).toBe(true);
    expect(report.actors.every((a) => a.role !== 'unknown')).toBe(true);
  });

  it('tells a progression story across three pulls', () => {
    const encounters = report.fights.filter((f) => f.isEncounter);
    expect(encounters).toHaveLength(3);
    expect(encounters.map((f) => f.attemptNumber)).toEqual([1, 2, 3]);
    // Two wipes then a kill, with the boss pushed lower each time.
    expect(encounters.map((f) => f.kill)).toEqual([false, false, true]);
    const pcts = encounters.map((f) => f.bossPercentage!);
    expect(pcts[0]!).toBeGreaterThan(pcts[1]!);
    expect(pcts[1]!).toBeGreaterThan(pcts[2]!);
  });

  it('produces analyses through the real engine', () => {
    for (const fight of report.fights) {
      const analysis = getDemoAnalysis(fight.id)!;
      expect(analysis.players.length).toBe(20);
      expect(analysis.summary.raidDps).toBeGreaterThan(0);
      expect(analysis.timeline.length).toBeGreaterThan(0);
      expect(analysis.damageTakenSources.length).toBeGreaterThan(0);
    }
  });

  it('reconstructs pre-death windows', () => {
    const analysis = getDemoAnalysis(report.fights[0]!.id)!;
    expect(analysis.deaths.length).toBeGreaterThan(0);
    for (const death of analysis.deaths) {
      expect(death.windowUnavailable).toBe(false);
      expect(death.precedingDamage.length).toBeGreaterThan(0);
      expect(death.damageInWindow).toBeGreaterThan(0);
    }
  });

  it('gives every death window a distinct total', () => {
    const analysis = getDemoAnalysis(report.fights[0]!.id)!;
    const totals = analysis.deaths.map((d) => d.damageInWindow);
    expect(new Set(totals).size).toBe(totals.length);
  });

  it('includes duplicate specs so same-spec comparison is exercised', () => {
    const analysis = getDemoAnalysis(report.fights[0]!.id)!;
    const groups = buildSpecComparisons(analysis);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.every((g) => g.players.length >= 2)).toBe(true);
  });

  it('attaches evidence to every finding', () => {
    for (const fight of report.fights) {
      const analysis = getDemoAnalysis(fight.id)!;
      for (const finding of analysis.findings) {
        expect(finding.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns null for a fight that does not exist', () => {
    expect(getDemoAnalysis(9999)).toBeNull();
  });
});
