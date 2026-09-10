/**
 * Report code / URL parsing.
 *
 * Accepts the shapes users actually paste: full report URLs (any Warcraft Logs
 * regional or classic subdomain), URLs carrying a fight anchor or query, and
 * bare report codes.
 */

/**
 * Warcraft Logs report codes are base62 and 16 characters in practice. The
 * range is widened slightly so a future format change degrades into a clean
 * "report not found" from the API rather than a local rejection of a valid
 * code, while still rejecting obvious junk.
 */
const CODE_PATTERN = /^[a-zA-Z0-9]{12,24}$/;

const HOST_PATTERN = /(^|\.)warcraftlogs\.com$/i;

export interface ParsedReport {
  code: string;
  /** Fight id from `#fight=12` or `?fight=12`, when present. */
  fightId: number | null;
  /** True when `fight=last` was requested. */
  wantsLastFight: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedReport }
  | { ok: false; reason: 'EMPTY' | 'INVALID_URL' | 'INVALID_REPORT_CODE' };

export function parseReportInput(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, reason: 'EMPTY' };

  // Bare code (no scheme, no slashes).
  if (!input.includes('/') && !input.includes(':')) {
    return CODE_PATTERN.test(input)
      ? { ok: true, value: { code: input, fightId: null, wantsLastFight: false } }
      : { ok: false, reason: 'INVALID_REPORT_CODE' };
  }

  const url = toUrl(input);
  if (!url) return { ok: false, reason: 'INVALID_URL' };
  if (!HOST_PATTERN.test(url.hostname)) return { ok: false, reason: 'INVALID_URL' };

  const segments = url.pathname.split('/').filter(Boolean);
  const reportsIndex = segments.findIndex((s) => s.toLowerCase() === 'reports');
  if (reportsIndex === -1) return { ok: false, reason: 'INVALID_URL' };

  // Skip sub-routes such as /reports/compare/<code> that precede the code.
  let code: string | null = null;
  for (const segment of segments.slice(reportsIndex + 1)) {
    if (CODE_PATTERN.test(segment)) {
      code = segment;
      break;
    }
  }
  if (!code) return { ok: false, reason: 'INVALID_REPORT_CODE' };

  const fight = readFight(url);
  return { ok: true, value: { code, fightId: fight.id, wantsLastFight: fight.last } };
}

function toUrl(input: string): URL | null {
  try {
    return new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    return null;
  }
}

function readFight(url: URL): { id: number | null; last: boolean } {
  // Warcraft Logs puts fight state in the hash: #fight=12&type=damage-done
  const candidates: URLSearchParams[] = [url.searchParams];
  if (url.hash.startsWith('#')) candidates.push(new URLSearchParams(url.hash.slice(1)));

  for (const params of candidates) {
    const value = params.get('fight');
    if (!value) continue;
    if (value.toLowerCase() === 'last') return { id: null, last: true };
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return { id: parsed, last: false };
  }
  return { id: null, last: false };
}

/** Canonical link back to a fight on Warcraft Logs, for evidence provenance. */
export function warcraftLogsLink(code: string, fightId?: number | null): string {
  const base = `https://www.warcraftlogs.com/reports/${encodeURIComponent(code)}`;
  return fightId ? `${base}#fight=${fightId}` : base;
}
