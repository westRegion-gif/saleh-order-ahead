import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheClear } from '@/lib/cache';
import { isOpenAiConfigured, parseAiJson, runAiAnalysis, sanitizeText } from '@/lib/openai/aiService';
import { buildAnalysisPayload } from '@/lib/openai/prompt';
import type { FightAnalysis } from '@/lib/types';

const analysis: FightAnalysis = {
  reportCode: 'aBcD1234efGH5678',
  reportTitle: 'Test',
  fight: {
    id: 2, name: 'The Gatekeeper', encounterId: 2001, difficulty: 5, difficultyLabel: 'Mythic',
    startTime: 0, endTime: 240_000, durationMs: 240_000, kill: false, bossPercentage: 31.5,
    fightPercentage: 31.5, friendlyPlayerIds: [], isEncounter: true, attemptNumber: 1, attemptTotal: 2,
  },
  summary: {
    fightId: 2, encounter: 'The Gatekeeper', difficultyLabel: 'Mythic', durationMs: 240_000,
    durationLabel: '4m 00s', kill: false, bossPercentage: 31.5, raidDamage: 4_080_000, raidDps: 17_000,
    raidHealing: 2_000_000, raidHps: 8_333, raidDamageTaken: 1_200_000, deaths: 3, interrupts: 3,
    dispels: 2, playerCount: 4, firstDeathMs: 60_000, firstDeathLabel: '1:00', firstDeathPlayer: 'Boomy',
    composition: { tanks: 1, healers: 1, melee: 1, ranged: 1, unknown: 0 },
  },
  players: [], deaths: [], damageTakenSources: [], timeline: [], findings: [],
  coverage: {
    damage: true, healing: true, damageTaken: true, casts: true, interrupts: true,
    dispels: true, deaths: true, deathEvents: true, notes: [],
  },
  reportLink: 'https://www.warcraftlogs.com/reports/aBcD1234efGH5678#fight=2',
  source: 'warcraftlogs',
};

const VALID_COMPLETION = {
  pullSummary: 'The raid wiped at 31.5% after losing a ranged DPS early.',
  keyFailurePoints: [
    {
      severity: 'high',
      title: 'Early death removed raid damage',
      finding: 'Boomy died at 1:00, removing output for three quarters of the pull.',
      evidence: [{ timestamp: '1:00', player: 'Boomy', metric: 'Death', value: '1:00' }],
      recommendation: 'Review the 1:00 window.',
    },
  ],
  whatWentWell: [],
  deathAnalysis: [],
  mechanicalIssues: [],
  damageAnalysis: [],
  healingAnalysis: [],
  utilityAnalysis: [],
  playerCoaching: [
    {
      player: 'Boomy',
      keepDoing: [],
      fixNext: [
        {
          severity: 'medium', title: 'Survive the first minute',
          finding: 'Died at 1:00.',
          evidence: [{ timestamp: '1:00', player: 'Boomy', metric: 'Death', value: '1:00' }],
          recommendation: null,
        },
      ],
      watch: [],
    },
  ],
  nextPullPriorities: ['Survive the 1:00 window.'],
};

function completion(content: unknown, status = 200): Response {
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  cacheClear();
  process.env.OPENAI_API_KEY = 'sk-test-key';
  delete process.env.OPENAI_MODEL;
});

describe('configuration', () => {
  it('detects a configured key', () => {
    expect(isOpenAiConfigured()).toBe(true);
  });
  it('detects a missing key', () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAiConfigured()).toBe(false);
  });
  it('throws AI_NOT_CONFIGURED without calling the provider', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(runAiAnalysis({ analysis, fetchImpl })).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert(1)</script>Hello')).toBe('alert(1)Hello');
    expect(sanitizeText('<b>bold</b>')).toBe('bold');
  });
  it('collapses newlines and repeated whitespace', () => {
    expect(sanitizeText('a b\n\nc')).toBe('a b c');
  });
  it('truncates to the limit', () => {
    expect(sanitizeText('x'.repeat(500), 10)).toHaveLength(10);
  });
  it('handles non-strings safely', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(42)).toBe('42');
    expect(sanitizeText({})).toBe('');
  });
});

describe('parseAiJson', () => {
  it('parses a bare JSON object', () => {
    expect(parseAiJson(JSON.stringify(VALID_COMPLETION)).success).toBe(true);
  });
  it('tolerates a markdown fence', () => {
    expect(parseAiJson('```json\n' + JSON.stringify(VALID_COMPLETION) + '\n```').success).toBe(true);
  });
  it('rejects non-JSON without throwing', () => {
    expect(parseAiJson('I cannot help with that.').success).toBe(false);
  });
});

describe('runAiAnalysis', () => {
  it('sends the key as a bearer header and never in the body', async () => {
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    await runAiAnalysis({ analysis, fetchImpl });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.headers.Authorization).toBe('Bearer sk-test-key');
    expect(String(init.body)).not.toContain('sk-test-key');
  });

  it('requests JSON-object output', async () => {
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    await runAiAnalysis({ analysis, fetchImpl });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(String(init.body)).response_format).toEqual({ type: 'json_object' });
  });

  it('returns a structured analysis', async () => {
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    const result = await runAiAnalysis({ analysis, fetchImpl });
    expect(result.pullSummary).toContain('31.5%');
    expect(result.keyFailurePoints).toHaveLength(1);
    expect(result.playerCoaching[0]!.player).toBe('Boomy');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('stamps every AI evidence item with the source and a report link', async () => {
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    const result = await runAiAnalysis({ analysis, fetchImpl });
    for (const e of result.keyFailurePoints[0]!.evidence) {
      expect(e.source).toBe('WARCRAFT LOGS');
      expect(e.reportLink).toContain('aBcD1234efGH5678');
    }
  });

  it('DROPS a finding that cites no evidence', async () => {
    const noEvidence = {
      ...VALID_COMPLETION,
      keyFailurePoints: [
        { severity: 'high', title: 'Vibes', finding: 'It felt bad.', evidence: [], recommendation: null },
      ],
    };
    const fetchImpl = vi.fn(async () => completion(noEvidence)) as unknown as typeof fetch;
    const result = await runAiAnalysis({ analysis, fetchImpl });
    expect(result.keyFailurePoints).toHaveLength(0);
  });

  it('sanitises injected markup out of model output', async () => {
    const nasty = { ...VALID_COMPLETION, pullSummary: '<img src=x onerror=alert(1)>Wipe at 31.5%' };
    const fetchImpl = vi.fn(async () => completion(nasty)) as unknown as typeof fetch;
    const result = await runAiAnalysis({ analysis, fetchImpl });
    expect(result.pullSummary).toBe('Wipe at 31.5%');
    expect(result.pullSummary).not.toContain('<');
  });

  it('caches so a second call does not re-bill the provider', async () => {
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    await runAiAnalysis({ analysis, fetchImpl });
    await runAiAnalysis({ analysis, fetchImpl });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('maps a rejected key to AI_ERROR', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(runAiAnalysis({ analysis, fetchImpl })).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('maps rate limiting to AI_ERROR', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow', { status: 429 })) as unknown as typeof fetch;
    await expect(runAiAnalysis({ analysis, fetchImpl })).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('maps an unreachable provider to AI_ERROR', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    await expect(runAiAnalysis({ analysis, fetchImpl })).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('rejects a non-JSON completion instead of rendering prose', async () => {
    const fetchImpl = vi.fn(async () => completion('Sorry, I cannot do that.')) as unknown as typeof fetch;
    await expect(runAiAnalysis({ analysis, fetchImpl })).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('honours OPENAI_MODEL', async () => {
    process.env.OPENAI_MODEL = 'gpt-4o';
    const fetchImpl = vi.fn(async () => completion(VALID_COMPLETION)) as unknown as typeof fetch;
    const result = await runAiAnalysis({ analysis, fetchImpl });
    expect(result.model).toBe('gpt-4o');
  });
});

describe('buildAnalysisPayload', () => {
  const payload = buildAnalysisPayload(analysis);

  it('includes the computed summary the model must not recalculate', () => {
    expect(payload.raidSummary.raidDps).toBe(17_000);
    expect(payload.fight.result).toBe('wipe');
    expect(payload.fight.bossPercentRemaining).toBe(31.5);
  });

  it('never includes raw event streams', () => {
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('"sourceID"');
    expect(serialised).not.toContain('"abilityGameID"');
  });

  it('warns the model not to read missing datasets as zeros', () => {
    expect(payload.dataCoverage.caveat).toContain('Do not interpret a missing dataset as a zero');
  });
});
