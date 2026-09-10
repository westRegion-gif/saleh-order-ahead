/** Compare two attempts of the same encounter. */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyseFight } from '@/lib/warcraftlogs/fightService';
import { isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { getDemoAnalysis, isDemoCode } from '@/lib/demo/fixtures';
import { comparePulls } from '@/lib/analysis/comparePulls';
import { fightIdSchema, readBody, reportCodeSchema, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  code: reportCodeSchema,
  fightIdA: fightIdSchema,
  fightIdB: fightIdSchema,
});

export const POST = withApi(async (request) => {
  const { code, fightIdA, fightIdB } = await readBody(request, bodySchema);

  if (fightIdA === fightIdB) {
    throw new NoxError('BAD_REQUEST', 'Pick two different pulls to compare.');
  }

  const load = async (fightId: number) => {
    if (isDemoCode(code)) {
      const analysis = getDemoAnalysis(fightId);
      if (!analysis) throw new NoxError('FIGHT_NOT_FOUND');
      return analysis;
    }
    if (!isWarcraftLogsConfigured()) throw new NoxError('NOT_CONFIGURED');
    return analyseFight({ code, fightId });
  };

  // Both pulls are independent; fetch them together.
  const [a, b] = await Promise.all([load(fightIdA), load(fightIdB)]);

  if (a.fight.encounterId !== b.fight.encounterId) {
    throw new NoxError('BAD_REQUEST', 'Those pulls are different encounters, so the numbers are not comparable.');
  }

  return NextResponse.json({ comparison: comparePulls(a, b) });
});
