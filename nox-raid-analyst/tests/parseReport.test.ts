import { describe, expect, it } from 'vitest';
import { parseReportInput, warcraftLogsLink } from '@/lib/warcraftlogs/parseReport';

const CODE = 'aBcD1234efGH5678';

describe('parseReportInput', () => {
  it('accepts a bare report code', () => {
    const r = parseReportInput(CODE);
    expect(r).toEqual({ ok: true, value: { code: CODE, fightId: null, wantsLastFight: false } });
  });

  it('accepts a canonical report URL', () => {
    const r = parseReportInput(`https://www.warcraftlogs.com/reports/${CODE}`);
    expect(r.ok && r.value.code).toBe(CODE);
  });

  it('accepts a URL without a scheme', () => {
    const r = parseReportInput(`www.warcraftlogs.com/reports/${CODE}`);
    expect(r.ok && r.value.code).toBe(CODE);
  });

  it('accepts classic and regional subdomains', () => {
    for (const host of ['classic.warcraftlogs.com', 'fresh.warcraftlogs.com', 'warcraftlogs.com']) {
      const r = parseReportInput(`https://${host}/reports/${CODE}`);
      expect(r.ok && r.value.code, host).toBe(CODE);
    }
  });

  it('extracts the fight id from the hash', () => {
    const r = parseReportInput(`https://www.warcraftlogs.com/reports/${CODE}#fight=12&type=damage-done`);
    expect(r.ok && r.value.fightId).toBe(12);
  });

  it('extracts the fight id from the query string', () => {
    const r = parseReportInput(`https://www.warcraftlogs.com/reports/${CODE}?fight=7`);
    expect(r.ok && r.value.fightId).toBe(7);
  });

  it('recognises fight=last', () => {
    const r = parseReportInput(`https://www.warcraftlogs.com/reports/${CODE}#fight=last`);
    expect(r.ok && r.value.wantsLastFight).toBe(true);
    expect(r.ok && r.value.fightId).toBeNull();
  });

  it('tolerates a trailing slash and surrounding whitespace', () => {
    const r = parseReportInput(`  https://www.warcraftlogs.com/reports/${CODE}/  `);
    expect(r.ok && r.value.code).toBe(CODE);
  });

  it('finds the code past an intermediate sub-route', () => {
    const r = parseReportInput(`https://www.warcraftlogs.com/reports/compare/${CODE}`);
    expect(r.ok && r.value.code).toBe(CODE);
  });

  it('rejects an empty string', () => {
    expect(parseReportInput('   ')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('rejects a non-Warcraft-Logs host', () => {
    const r = parseReportInput(`https://evil.example.com/reports/${CODE}`);
    expect(r).toEqual({ ok: false, reason: 'INVALID_URL' });
  });

  it('does not treat a lookalike host as Warcraft Logs', () => {
    const r = parseReportInput(`https://notwarcraftlogs.com/reports/${CODE}`);
    expect(r).toEqual({ ok: false, reason: 'INVALID_URL' });
  });

  it('rejects a URL with no reports segment', () => {
    expect(parseReportInput('https://www.warcraftlogs.com/zone/rankings/1')).toEqual({
      ok: false,
      reason: 'INVALID_URL',
    });
  });

  it('rejects a malformed code', () => {
    expect(parseReportInput('short')).toEqual({ ok: false, reason: 'INVALID_REPORT_CODE' });
    expect(parseReportInput('has-a-dash-in-it!!')).toEqual({ ok: false, reason: 'INVALID_REPORT_CODE' });
    expect(parseReportInput(`https://www.warcraftlogs.com/reports/nope`)).toEqual({
      ok: false,
      reason: 'INVALID_REPORT_CODE',
    });
  });
});

describe('warcraftLogsLink', () => {
  it('builds a report link', () => {
    expect(warcraftLogsLink(CODE)).toBe(`https://www.warcraftlogs.com/reports/${CODE}`);
  });
  it('builds a fight-anchored link', () => {
    expect(warcraftLogsLink(CODE, 3)).toBe(`https://www.warcraftlogs.com/reports/${CODE}#fight=3`);
  });
});
