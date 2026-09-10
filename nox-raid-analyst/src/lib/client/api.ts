'use client';

/**
 * Browser-side API helpers.
 *
 * Every call is abortable so that switching pulls or players cancels work the
 * user no longer wants, and results are held in a session-scoped map so moving
 * between tabs never refetches an analysis that is already loaded.
 */

import type { AiAnalysis, FightAnalysis, NoxReport, PullComparison } from '@/lib/types';
import type { SpecComparison } from '@/lib/analysis/comparePulls';

export interface ApiError {
  code: string;
  message: string;
  detail: string | null;
}

export class NoxApiError extends Error {
  readonly code: string;
  readonly detail: string | null;
  constructor(error: ApiError) {
    super(error.message);
    this.name = 'NoxApiError';
    this.code = error.code;
    this.detail = error.detail;
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NoxApiError({
      code: 'NETWORK',
      message: 'Could not reach the NOX server.',
      detail: null,
    });
  }

  const payload = (await response.json().catch(() => null)) as { error?: ApiError } | T | null;

  if (!response.ok) {
    const error = (payload as { error?: ApiError } | null)?.error;
    throw new NoxApiError(
      error ?? { code: 'INTERNAL', message: `Request failed (HTTP ${response.status}).`, detail: null },
    );
  }
  return payload as T;
}

export interface ReportResponse {
  report: NoxReport;
  defaultFightId: number | null;
  source: 'warcraftlogs' | 'demo';
  demoCode?: string;
}

export function loadReport(input: string, signal?: AbortSignal) {
  return post<ReportResponse>('/api/report', { input }, signal);
}

export interface FightResponse {
  analysis: FightAnalysis;
  specComparisons: SpecComparison[];
}

export function loadFight(code: string, fightId: number, signal?: AbortSignal) {
  return post<FightResponse>('/api/fight', { code, fightId }, signal);
}

export function loadComparison(code: string, fightIdA: number, fightIdB: number, signal?: AbortSignal) {
  return post<{ comparison: PullComparison }>('/api/compare', { code, fightIdA, fightIdB }, signal);
}

export function loadAi(code: string, fightId: number, signal?: AbortSignal) {
  return post<{ ai: AiAnalysis }>('/api/ai', { code, fightId }, signal);
}

export interface StatusResponse {
  warcraftLogs: { connected: boolean; variables: string[] };
  openai: { connected: boolean; variables: string[]; model: string };
  devMode: boolean;
  diagnostics: {
    ts: string; kind: string; ok: boolean; message: string;
    durationMs?: number; cache?: string;
  }[];
  cache: { entries: number; inflight: number } | null;
  rateLimit: { limitPerHour: number | null; pointsSpentThisHour: number | null } | null;
}

export async function loadStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const response = await fetch('/api/status', { signal });
  if (!response.ok) throw new NoxApiError({ code: 'INTERNAL', message: 'Status unavailable.', detail: null });
  return (await response.json()) as StatusResponse;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function errorOf(err: unknown): { message: string; detail: string | null } {
  if (err instanceof NoxApiError) return { message: err.message, detail: err.detail };
  if (err instanceof Error) return { message: err.message, detail: null };
  return { message: 'Something went wrong.', detail: null };
}
