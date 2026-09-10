/**
 * Event stream retrieval with correct pagination.
 *
 * Warcraft Logs returns events in pages, signalling more data with
 * `nextPageTimestamp`. Pages are followed until the stream is exhausted or a
 * bounded page cap is hit. When the cap truncates a stream the caller is told
 * explicitly — a partial dataset must never be presented as complete.
 */

import 'server-only';
import { dedupe, TTL } from '@/lib/cache';
import { graphql } from './client';
import { EVENTS_QUERY } from './queries';
import { asArray, asRecord, num } from './normalize';
import { recordDiagnostic } from '@/lib/log';

/** Hard ceiling on pages per stream, to bound API point spend. */
const MAX_PAGES = 10;
const PAGE_LIMIT = 2000;

export interface EventPage {
  events: Record<string, unknown>[];
  /** True when MAX_PAGES was hit and more data remained upstream. */
  truncated: boolean;
  pages: number;
}

interface EventsResponse {
  reportData?: {
    report?: { events?: { data?: unknown; nextPageTimestamp?: unknown } | null } | null;
  } | null;
}

export interface FetchEventsArgs {
  code: string;
  fightId: number;
  dataType: string;
  /** Milliseconds relative to report start (Warcraft Logs convention). */
  startTime: number;
  endTime: number;
  /** Narrow the stream to one target actor, cutting payload dramatically. */
  targetId?: number | null;
  fetchImpl?: typeof fetch;
}

/** Fetch every page of an event stream within a time window. */
export async function fetchEvents(args: FetchEventsArgs): Promise<EventPage> {
  const { code, fightId, dataType, startTime, endTime, targetId, fetchImpl } = args;
  const key = `wcl:events:${code}:${fightId}:${dataType}:${Math.round(startTime)}:${Math.round(endTime)}:${targetId ?? 'all'}`;

  const { value } = await dedupe(
    key,
    TTL.events,
    async () => {
      const events: Record<string, unknown>[] = [];
      let cursor = startTime;
      let pages = 0;
      let truncated = false;

      while (pages < MAX_PAGES) {
        const data = await graphql<EventsResponse>(
          EVENTS_QUERY,
          {
            code,
            fightIDs: [fightId],
            dataType,
            startTime: cursor,
            endTime,
            limit: PAGE_LIMIT,
            ...(targetId !== null && targetId !== undefined ? { targetID: targetId } : {}),
          },
          { label: `events:${dataType}`, fetchImpl },
        );

        const payload = data.reportData?.report?.events;
        if (!payload) break;

        for (const raw of asArray(payload.data)) {
          const event = asRecord(raw);
          if (event) events.push(event);
        }
        pages += 1;

        const next = num(payload.nextPageTimestamp);
        if (next === null || next <= cursor || next >= endTime) break;
        cursor = next;

        if (pages >= MAX_PAGES) {
          truncated = true;
          recordDiagnostic({
            kind: 'wcl-graphql',
            ok: false,
            message: `events:${dataType} truncated at ${MAX_PAGES} pages`,
            meta: { fightId, collected: events.length },
          });
        }
      }

      return { events, truncated, pages } satisfies EventPage;
    },
    `events ${dataType} ${code}#${fightId}`,
  );

  return value;
}
