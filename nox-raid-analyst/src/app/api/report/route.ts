/**
 * Resolve a pasted Warcraft Logs URL or code into report metadata.
 *
 * Returns the fight list and roster only — no combat data. Selecting a fight
 * is what triggers the expensive retrieval.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseReportInput } from '@/lib/warcraftlogs/parseReport';
import { fetchReport } from '@/lib/warcraftlogs/reportService';
import { pickDefaultFight } from '@/lib/warcraftlogs/fightService';
import { isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { getDemoReport, isDemoCode, DEMO_REPORT_CODE } from '@/lib/demo/fixtures';
import { readBody, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  input: z.string().min(1).max(500),
});

export const POST = withApi(async (request) => {
  const { input } = await readBody(request, bodySchema);

  // The demo dataset is addressable by its code and is always clearly flagged.
  if (isDemoCode(input.trim())) {
    const report = getDemoReport();
    return NextResponse.json({
      report,
      defaultFightId: pickDefaultFight(report.fights, null, false)?.id ?? null,
      source: 'demo',
    });
  }

  const parsed = parseReportInput(input);
  if (!parsed.ok) {
    throw new NoxError(
      parsed.reason === 'INVALID_URL'
        ? 'INVALID_URL'
        : parsed.reason === 'EMPTY'
          ? 'BAD_REQUEST'
          : 'INVALID_REPORT_CODE',
    );
  }

  if (!isWarcraftLogsConfigured()) throw new NoxError('NOT_CONFIGURED');

  const { report } = await fetchReport(parsed.value.code);
  const defaultFight = pickDefaultFight(report.fights, parsed.value.fightId, parsed.value.wantsLastFight);

  return NextResponse.json({
    report,
    defaultFightId: defaultFight?.id ?? null,
    source: 'warcraftlogs',
    demoCode: DEMO_REPORT_CODE,
  });
});
