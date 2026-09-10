/** Full deterministic analysis for one pull. */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyseFight } from '@/lib/warcraftlogs/fightService';
import { isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { getDemoAnalysis, isDemoCode } from '@/lib/demo/fixtures';
import { buildSpecComparisons } from '@/lib/analysis/comparePulls';
import { fightIdSchema, readBody, reportCodeSchema, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  code: reportCodeSchema,
  fightId: fightIdSchema,
});

export const POST = withApi(async (request) => {
  const { code, fightId } = await readBody(request, bodySchema);

  if (isDemoCode(code)) {
    const analysis = getDemoAnalysis(fightId);
    if (!analysis) throw new NoxError('FIGHT_NOT_FOUND');
    return NextResponse.json({ analysis, specComparisons: buildSpecComparisons(analysis) });
  }

  if (!isWarcraftLogsConfigured()) throw new NoxError('NOT_CONFIGURED');

  const analysis = await analyseFight({ code, fightId });
  return NextResponse.json({ analysis, specComparisons: buildSpecComparisons(analysis) });
});
