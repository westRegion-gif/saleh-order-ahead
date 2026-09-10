/**
 * Optional AI interpretation of an already-computed analysis.
 *
 * SECURITY: the OpenAI key never leaves the server. The browser calls this
 * route; this route calls OpenAI.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyseFight } from '@/lib/warcraftlogs/fightService';
import { isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { getDemoAnalysis, isDemoCode } from '@/lib/demo/fixtures';
import { isOpenAiConfigured, runAiAnalysis } from '@/lib/openai/aiService';
import { fightIdSchema, readBody, reportCodeSchema, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  code: reportCodeSchema,
  fightId: fightIdSchema,
});

export const POST = withApi(async (request) => {
  const { code, fightId } = await readBody(request, bodySchema);

  if (!isOpenAiConfigured()) throw new NoxError('AI_NOT_CONFIGURED');

  let analysis;
  if (isDemoCode(code)) {
    analysis = getDemoAnalysis(fightId);
    if (!analysis) throw new NoxError('FIGHT_NOT_FOUND');
  } else {
    if (!isWarcraftLogsConfigured()) throw new NoxError('NOT_CONFIGURED');
    // Cached from the fight route in the normal flow, so this is usually free.
    analysis = await analyseFight({ code, fightId });
  }

  const ai = await runAiAnalysis({ analysis });
  return NextResponse.json({ ai, source: analysis.source });
});
