/**
 * Integration status for the Settings page.
 *
 * SECURITY: reports only whether a credential is PRESENT. No secret value, no
 * prefix, no length, ever leaves the server.
 */

import { NextResponse } from 'next/server';
import { isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';
import { isOpenAiConfigured } from '@/lib/openai/aiService';
import { cacheStats } from '@/lib/cache';
import { readDiagnostics } from '@/lib/log';
import { getLastRateLimit } from '@/lib/warcraftlogs/client';
import { withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = withApi(async () => {
  const devMode = process.env.NOX_DEV_MODE === 'true';

  return NextResponse.json({
    warcraftLogs: {
      connected: isWarcraftLogsConfigured(),
      variables: ['WARCRAFTLOGS_CLIENT_ID', 'WARCRAFTLOGS_CLIENT_SECRET'],
    },
    openai: {
      connected: isOpenAiConfigured(),
      variables: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    },
    devMode,
    // Diagnostics are redacted at capture time; still gated behind dev mode.
    diagnostics: devMode ? readDiagnostics() : [],
    cache: devMode ? cacheStats() : null,
    rateLimit: devMode ? getLastRateLimit() : null,
  });
});
