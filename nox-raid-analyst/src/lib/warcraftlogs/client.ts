/**
 * Warcraft Logs API v2 GraphQL client.
 *
 * SECURITY: queries are static documents; every caller-supplied value travels
 * as a GraphQL variable. No query string is ever assembled from user input.
 */

import 'server-only';
import { recordDiagnostic } from '@/lib/log';
import { NoxError, type NoxErrorCode } from './errors';
import { getAccessToken, invalidateToken } from './oauth';

const ENDPOINT = 'https://www.warcraftlogs.com/api/v2/client';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface RateLimitSnapshot {
  limitPerHour: number | null;
  pointsSpentThisHour: number | null;
  pointsResetIn: number | null;
  capturedAt: string;
}

let lastRateLimit: RateLimitSnapshot | null = null;
export function getLastRateLimit(): RateLimitSnapshot | null {
  return lastRateLimit;
}
export function setLastRateLimit(snapshot: RateLimitSnapshot): void {
  lastRateLimit = snapshot;
}

export interface QueryOptions {
  /** Label used in diagnostics; never contains user input. */
  label: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Execute a GraphQL document. Retries transient upstream failures with bounded
 * exponential backoff, and refreshes the token exactly once on a 401.
 */
export async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  options: QueryOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let tokenRetried = false;
  let lastTransient: NoxErrorCode = 'UPSTREAM_UNAVAILABLE';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const started = Date.now();
    let response: Response;

    try {
      const token = await getAccessToken(fetchImpl);
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (err) {
      if (err instanceof NoxError) throw err;
      lastTransient = 'UPSTREAM_UNAVAILABLE';
      recordDiagnostic({
        kind: 'wcl-error',
        ok: false,
        message: `${options.label}: network failure (attempt ${attempt + 1})`,
        durationMs: Date.now() - started,
      });
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new NoxError('UPSTREAM_UNAVAILABLE');
    }

    const durationMs = Date.now() - started;

    // Expired or revoked token: refresh once, then retry immediately.
    if (response.status === 401 && !tokenRetried) {
      tokenRetried = true;
      invalidateToken();
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: token rejected, refreshing` });
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: HTTP ${response.status}`, durationMs });
      throw new NoxError(response.status === 403 ? 'REPORT_PRIVATE' : 'AUTH_FAILED');
    }
    if (response.status === 429) {
      recordDiagnostic({ kind: 'ratelimit', ok: false, message: `${options.label}: rate limited`, durationMs });
      throw new NoxError('RATE_LIMITED');
    }
    if (response.status >= 500) {
      lastTransient = 'UPSTREAM_UNAVAILABLE';
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: HTTP ${response.status}`, durationMs });
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new NoxError('UPSTREAM_UNAVAILABLE');
    }
    if (!response.ok) {
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: HTTP ${response.status}`, durationMs });
      throw new NoxError('GRAPHQL_ERROR', `Warcraft Logs returned HTTP ${response.status}.`);
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: T; errors?: GraphQLError[] }
      | null;

    if (!body) {
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: unparseable response`, durationMs });
      throw new NoxError('GRAPHQL_ERROR', 'Warcraft Logs returned a response NOX could not read.');
    }

    if (body.errors?.length) {
      const mapped = mapGraphQLErrors(body.errors);
      recordDiagnostic({
        kind: 'wcl-graphql',
        ok: false,
        message: `${options.label}: ${body.errors.map((e) => e.message).join(' | ')}`,
        durationMs,
      });
      throw mapped;
    }

    if (body.data === undefined || body.data === null) {
      recordDiagnostic({ kind: 'wcl-graphql', ok: false, message: `${options.label}: empty data`, durationMs });
      throw new NoxError('GRAPHQL_ERROR', 'Warcraft Logs returned no data for that query.');
    }

    recordDiagnostic({ kind: 'wcl-graphql', ok: true, message: `${options.label} ok`, durationMs });
    return body.data;
  }

  throw new NoxError(lastTransient);
}

/** Translate upstream GraphQL error text into the NOX error taxonomy. */
export function mapGraphQLErrors(errors: GraphQLError[]): NoxError {
  const joined = errors.map((e) => e.message ?? '').join(' ').toLowerCase();

  if (joined.includes('do not have permission') || joined.includes('not authorized') || joined.includes('private')) {
    return new NoxError('REPORT_PRIVATE');
  }
  if (joined.includes('does not exist') || joined.includes('not found') || joined.includes('no report')) {
    return new NoxError('REPORT_NOT_FOUND');
  }
  if (joined.includes('rate limit') || joined.includes('too many requests') || joined.includes('points')) {
    return new NoxError('RATE_LIMITED');
  }
  const first = errors[0]?.message;
  return new NoxError('GRAPHQL_ERROR', first ? sanitizeMessage(first) : null);
}

/** Keep upstream text short and free of anything that resembles a token. */
function sanitizeMessage(message: string): string {
  return message.replace(/[A-Za-z0-9._-]{40,}/g, '[…]').slice(0, 200);
}

function backoff(attempt: number): Promise<void> {
  // 500ms, 1s, 2s with jitter.
  const base = 500 * 2 ** attempt;
  const jitter = Math.random() * 200;
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}
