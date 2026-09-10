/**
 * TTL cache with in-flight request deduplication.
 *
 * Warcraft Logs bills by API points, so two things matter: never fetch the
 * same thing twice, and never fire two identical requests concurrently just
 * because a user clicked between tabs. `dedupe` covers both — a second caller
 * for a key that is already in flight awaits the first caller's promise
 * instead of issuing its own request.
 */

import { recordDiagnostic } from '@/lib/log';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export type CacheOutcome = 'hit' | 'miss' | 'dedupe';

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Default TTLs, milliseconds. Report structure changes rarely; tables never. */
export const TTL = {
  token: 60 * 60 * 1000,
  report: 10 * 60 * 1000,
  /** A completed fight's combat data is immutable, so it can be held longer. */
  fight: 30 * 60 * 1000,
  events: 30 * 60 * 1000,
  ai: 30 * 60 * 1000,
} as const;

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(prefix: string): number {
  let removed = 0;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function cacheClear(): void {
  store.clear();
  inflight.clear();
}

export function cacheStats(): { entries: number; inflight: number } {
  return { entries: store.size, inflight: inflight.size };
}

/**
 * Resolve `key` from cache, or run `producer` exactly once for concurrent
 * callers. Failures are never cached.
 */
export async function dedupe<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
  label?: string,
): Promise<{ value: T; outcome: CacheOutcome }> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) {
    if (label) recordDiagnostic({ kind: 'cache', ok: true, message: `${label} served from cache`, cache: 'hit' });
    return { value: cached, outcome: 'hit' };
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    if (label) recordDiagnostic({ kind: 'cache', ok: true, message: `${label} joined in-flight request`, cache: 'dedupe' });
    return { value: await pending, outcome: 'dedupe' };
  }

  const promise = producer()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const value = await promise;
  if (label) recordDiagnostic({ kind: 'cache', ok: true, message: `${label} fetched`, cache: 'miss' });
  return { value, outcome: 'miss' };
}
