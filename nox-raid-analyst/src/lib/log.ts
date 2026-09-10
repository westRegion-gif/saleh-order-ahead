/**
 * Developer-facing logging plus an in-memory diagnostics ring buffer that the
 * Settings page can render.
 *
 * SECURITY: `redact` scrubs anything that looks like a credential before a
 * value reaches a log sink or the diagnostics buffer. Secrets must never be
 * printed, and must never be returned to the browser.
 */

export type DiagnosticKind =
  | 'wcl-token'
  | 'wcl-graphql'
  | 'wcl-error'
  | 'cache'
  | 'ai'
  | 'ratelimit';

export interface DiagnosticEntry {
  ts: string;
  kind: DiagnosticKind;
  ok: boolean;
  message: string;
  durationMs?: number;
  /** cache hit/miss for the operation, when relevant. */
  cache?: 'hit' | 'miss' | 'dedupe';
  meta?: Record<string, string | number | boolean | null>;
}

const SECRET_HINTS = [
  'client_secret',
  'clientsecret',
  'authorization',
  'access_token',
  'accesstoken',
  'api_key',
  'apikey',
  'bearer',
  'password',
  'secret',
];

/** Replace anything credential-shaped with a fixed marker. */
export function redact(input: unknown): string {
  let text = typeof input === 'string' ? input : safeStringify(input);

  // Bearer tokens and long opaque credential-looking strings.
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]');
  text = text.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
  text = text.replace(/\b(sk|pk)-[A-Za-z0-9._\-]{8,}/g, '[REDACTED]');

  // key=value / "key": "value" forms for known-sensitive keys.
  for (const hint of SECRET_HINTS) {
    const kv = new RegExp(`("?${hint}"?\\s*[:=]\\s*"?)([^",&\\s}]{4,})`, 'gi');
    text = text.replace(kv, '$1[REDACTED]');
  }
  return text;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

const MAX_ENTRIES = 60;
const buffer: DiagnosticEntry[] = [];

export function recordDiagnostic(entry: Omit<DiagnosticEntry, 'ts'>): void {
  const safe: DiagnosticEntry = {
    ...entry,
    ts: new Date().toISOString(),
    message: redact(entry.message),
  };
  buffer.push(safe);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);

  const line = `[nox:${safe.kind}] ${safe.ok ? 'ok' : 'FAIL'} ${safe.message}`;
  if (safe.ok) console.log(line);
  else console.error(line);
}

export function readDiagnostics(): DiagnosticEntry[] {
  return [...buffer].reverse();
}

export function clearDiagnostics(): void {
  buffer.length = 0;
}
