/**
 * OAuth 2.0 client-credentials token service for the Warcraft Logs public API.
 *
 * SECURITY: the client id and secret are read from the server environment and
 * never leave this module. The access token is held in server memory only.
 * Nothing here is importable from a client component.
 */

import 'server-only';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';
import { recordDiagnostic } from '@/lib/log';
import { NoxError } from './errors';

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const TOKEN_CACHE_KEY = 'wcl:oauth:token';
/** Refresh this long before the real expiry so a request never races it. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export interface WarcraftLogsCredentials {
  clientId: string;
  clientSecret: string;
}

/** Read credentials from the environment. Returns null when unconfigured. */
export function readCredentials(): WarcraftLogsCredentials | null {
  const clientId = process.env.WARCRAFTLOGS_CLIENT_ID?.trim();
  const clientSecret = process.env.WARCRAFTLOGS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isWarcraftLogsConfigured(): boolean {
  return readCredentials() !== null;
}

/**
 * Return a valid access token, fetching a new one only when the cached token
 * is missing or close to expiry.
 */
export async function getAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const cached = cacheGet<CachedToken>(TOKEN_CACHE_KEY);
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const credentials = readCredentials();
  if (!credentials) throw new NoxError('NOT_CONFIGURED');

  const started = Date.now();
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch (err) {
    recordDiagnostic({
      kind: 'wcl-token',
      ok: false,
      message: `token request failed to reach Warcraft Logs: ${err instanceof Error ? err.message : 'unknown'}`,
      durationMs: Date.now() - started,
    });
    throw new NoxError('UPSTREAM_UNAVAILABLE');
  }

  if (response.status === 401 || response.status === 403) {
    recordDiagnostic({
      kind: 'wcl-token',
      ok: false,
      message: `credentials rejected (HTTP ${response.status})`,
      durationMs: Date.now() - started,
    });
    throw new NoxError('AUTH_FAILED');
  }
  if (response.status === 429) {
    recordDiagnostic({ kind: 'wcl-token', ok: false, message: 'token endpoint rate limited' });
    throw new NoxError('RATE_LIMITED');
  }
  if (!response.ok) {
    recordDiagnostic({
      kind: 'wcl-token',
      ok: false,
      message: `token endpoint returned HTTP ${response.status}`,
      durationMs: Date.now() - started,
    });
    throw new NoxError('UPSTREAM_UNAVAILABLE');
  }

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: unknown; expires_in?: unknown }
    | null;

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : null;
  if (!accessToken) {
    recordDiagnostic({ kind: 'wcl-token', ok: false, message: 'token response omitted access_token' });
    throw new NoxError('AUTH_FAILED');
  }

  const expiresInSec = typeof payload?.expires_in === 'number' ? payload.expires_in : 3600;
  const expiresAt = Date.now() + expiresInSec * 1000;

  // Cache until just before real expiry, bounded by the configured TTL.
  const ttl = Math.max(60_000, Math.min(expiresInSec * 1000 - EXPIRY_SAFETY_MARGIN_MS, TTL.token));
  cacheSet<CachedToken>(TOKEN_CACHE_KEY, { accessToken, expiresAt }, ttl);

  recordDiagnostic({
    kind: 'wcl-token',
    ok: true,
    message: 'access token issued',
    durationMs: Date.now() - started,
    meta: { expiresInSec },
  });

  return accessToken;
}

/** Drop the cached token, forcing a refresh on the next call. */
export function invalidateToken(): void {
  cacheSet<CachedToken>(TOKEN_CACHE_KEY, { accessToken: '', expiresAt: 0 }, 1);
}
