/** Report metadata + roster retrieval, cached and deduplicated. */

import 'server-only';
import { dedupe, TTL } from '@/lib/cache';
import { NoxError } from './errors';
import { graphql } from './client';
import { PLAYER_DETAILS_QUERY, REPORT_QUERY } from './queries';
import {
  applyPlayerDetails,
  asRecord,
  normalizeAbilities,
  normalizeReport,
  type AbilityDictionary,
} from './normalize';
import type { NoxReport } from '@/lib/types';

/**
 * A report plus its server-side-only ability dictionary. The dictionary is
 * stripped before anything is returned to the browser.
 */
export interface ReportBundle {
  report: NoxReport;
  abilities: AbilityDictionary;
}

interface ReportResponse {
  reportData?: { report?: unknown } | null;
}

/** Fetch and normalize a report. Throws a NoxError the UI can render. */
export async function fetchReport(code: string, fetchImpl?: typeof fetch): Promise<ReportBundle> {
  const { value } = await dedupe(
    `wcl:report:${code}`,
    TTL.report,
    async () => {
      const data = await graphql<ReportResponse>(
        REPORT_QUERY,
        { code },
        { label: 'report', fetchImpl },
      );

      const raw = data.reportData?.report;
      if (!raw) throw new NoxError('REPORT_NOT_FOUND');

      const report = normalizeReport(raw);
      if (!report) throw new NoxError('REPORT_NOT_FOUND');
      if (report.fights.length === 0) throw new NoxError('NO_FIGHTS');

      const masterData = asRecord(raw)?.masterData;
      return { report, abilities: normalizeAbilities(masterData) } satisfies ReportBundle;
    },
    `report ${code}`,
  );

  return value;
}

interface PlayerDetailsResponse {
  reportData?: { report?: { playerDetails?: unknown } | null } | null;
}

/**
 * Enrich the roster with role + spec for a specific fight.
 *
 * playerDetails is per-fight, so this is resolved lazily when a fight is
 * selected. A failure here is non-fatal: the roster keeps `roleConfirmed:
 * false` and the UI shows role as Unknown rather than guessing.
 */
export async function fetchFightRoster(
  report: NoxReport,
  fightId: number,
  fetchImpl?: typeof fetch,
): Promise<{ actors: NoxReport['actors']; confirmed: boolean }> {
  try {
    const { value } = await dedupe(
      `wcl:playerdetails:${report.code}:${fightId}`,
      TTL.fight,
      async () => {
        const data = await graphql<PlayerDetailsResponse>(
          PLAYER_DETAILS_QUERY,
          { code: report.code, fightIDs: [fightId] },
          { label: 'playerDetails', fetchImpl },
        );
        return data.reportData?.report?.playerDetails ?? null;
      },
      `playerDetails ${report.code}#${fightId}`,
    );

    if (!value || !asRecord(value)) {
      return { actors: report.actors, confirmed: false };
    }

    const actors = applyPlayerDetails(report.actors, value);
    const confirmed = actors.some((a) => a.roleConfirmed);
    return { actors, confirmed };
  } catch {
    // Role/spec is an enrichment; losing it must not fail the whole analysis.
    return { actors: report.actors, confirmed: false };
  }
}
