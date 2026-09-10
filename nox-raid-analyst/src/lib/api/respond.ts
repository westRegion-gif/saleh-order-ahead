/**
 * Shared API-route plumbing: body-size limits, endpoint rate protection,
 * input validation and consistent error shapes.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NoxError, toNoxError } from '@/lib/warcraftlogs/errors';

/** Reject oversized bodies before parsing them. */
const MAX_BODY_BYTES = 16 * 1024;

/** Per-client request budget for this process. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 40;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
  return ip;
}

/** Returns null when allowed, or a 429 response when the budget is spent. */
export function enforceRateLimit(request: Request): NextResponse | null {
  const key = rateLimitKey(request);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down.', detail: null } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  bucket.count += 1;
  return null;
}

/** Read and validate a JSON body against a schema. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new NoxError('BAD_REQUEST', 'Request body is too large.');
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new NoxError('BAD_REQUEST', 'Request body is too large.');
    }
    raw = JSON.parse(text);
  } catch (err) {
    if (err instanceof NoxError) throw err;
    throw new NoxError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new NoxError('BAD_REQUEST', first ? `${first.path.join('.')}: ${first.message}` : null);
  }
  return parsed.data;
}

/** Convert any thrown value into the standard error response. */
export function errorResponse(err: unknown): NextResponse {
  const nox = toNoxError(err);
  return NextResponse.json(nox.toJSON(), { status: nox.status });
}

/** Wrap a route handler with rate limiting and error mapping. */
export function withApi(handler: (request: Request) => Promise<NextResponse>) {
  return async (request: Request): Promise<NextResponse> => {
    const limited = enforceRateLimit(request);
    if (limited) return limited;
    try {
      return await handler(request);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Report codes as accepted by the parser, reused for direct-code endpoints. */
export const reportCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{12,24}$/, 'must be a valid Warcraft Logs report code');

export const fightIdSchema = z.number().int().positive().max(100_000);
