/**
 * AIAnalysisService — the optional interpretation layer.
 *
 * SECURITY: the OpenAI key is read from the server environment and used only
 * here. The browser never sees it and never talks to OpenAI directly.
 *
 * The deterministic engine is the product; this is an enhancement. Every
 * failure path returns a NoxError the UI renders as "AI unavailable" while the
 * rest of the analysis keeps working.
 */

import 'server-only';
import { z } from 'zod';
import type { AiAnalysis, Evidence, Finding, FightAnalysis, Severity } from '@/lib/types';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { recordDiagnostic } from '@/lib/log';
import { dedupe, TTL } from '@/lib/cache';
import { warcraftLogsLink } from '@/lib/warcraftlogs/parseReport';
import { buildAnalysisPayload, SYSTEM_PROMPT } from './prompt';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 90_000;

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

// --- response validation ---------------------------------------------------

const severitySchema = z.enum(['high', 'medium', 'low', 'info']).catch('info');

const rawEvidenceSchema = z.object({
  timestamp: z.string().nullish(),
  player: z.string().nullish(),
  metric: z.string(),
  value: z.union([z.string(), z.number()]),
});

const rawFindingSchema = z.object({
  severity: severitySchema,
  title: z.string(),
  finding: z.string(),
  evidence: z.array(rawEvidenceSchema).default([]),
  recommendation: z.string().nullish(),
});

const rawAnalysisSchema = z.object({
  pullSummary: z.string().default(''),
  keyFailurePoints: z.array(rawFindingSchema).default([]),
  whatWentWell: z.array(rawFindingSchema).default([]),
  deathAnalysis: z.array(rawFindingSchema).default([]),
  mechanicalIssues: z.array(rawFindingSchema).default([]),
  damageAnalysis: z.array(rawFindingSchema).default([]),
  healingAnalysis: z.array(rawFindingSchema).default([]),
  utilityAnalysis: z.array(rawFindingSchema).default([]),
  playerCoaching: z
    .array(
      z.object({
        player: z.string(),
        keepDoing: z.array(rawFindingSchema).default([]),
        fixNext: z.array(rawFindingSchema).default([]),
        watch: z.array(rawFindingSchema).default([]),
      }),
    )
    .default([]),
  nextPullPriorities: z.array(z.string()).default([]),
});

type RawFinding = z.infer<typeof rawFindingSchema>;

// --- output sanitisation ---------------------------------------------------

const TAG_PATTERN = /<[^>]*>/g;
// Control characters, which have no place in rendered coaching text.
const CONTROL_PATTERN = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/**
 * Strip anything markup-like out of model output before it reaches the DOM.
 * React escapes by default and this app never uses dangerouslySetInnerHTML,
 * so this is defence in depth over untrusted model text.
 */
export function sanitizeText(value: unknown, maxLength = 2000): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  return value
    .replace(TAG_PATTERN, '')
    .replace(CONTROL_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Convert a model-supplied finding into a NOX Finding.
 *
 * A finding whose evidence array is empty is DROPPED rather than rendered —
 * "every conclusion needs evidence" is enforced in code, not left to the
 * model's goodwill.
 */
function toFinding(
  raw: RawFinding,
  context: { reportCode: string; fightId: number },
  seq: () => number,
): Finding | null {
  const evidence: Evidence[] = raw.evidence
    .map((item): Evidence | null => {
      const metric = sanitizeText(item.metric, 120);
      const value = sanitizeText(item.value, 200);
      if (!metric || !value) return null;
      const built: Evidence = {
        id: `ai-ev-${context.fightId}-${seq()}`,
        source: 'WARCRAFT LOGS',
        category: 'timeline',
        metric,
        value,
        reportLink: warcraftLogsLink(context.reportCode, context.fightId),
      };
      const player = sanitizeText(item.player ?? '', 60);
      if (player) built.player = player;
      const timestamp = sanitizeText(item.timestamp ?? '', 20);
      if (timestamp) built.timestampLabel = timestamp;
      return built;
    })
    .filter((e): e is Evidence => e !== null);

  if (evidence.length === 0) return null;

  const title = sanitizeText(raw.title, 160);
  const finding = sanitizeText(raw.finding, 1500);
  if (!title || !finding) return null;

  const recommendation = sanitizeText(raw.recommendation ?? '', 800);

  return {
    severity: raw.severity as Severity,
    title,
    finding,
    evidence,
    recommendation: recommendation || null,
  };
}

function toFindings(
  raws: RawFinding[],
  context: { reportCode: string; fightId: number },
  seq: () => number,
): Finding[] {
  return raws.map((r) => toFinding(r, context, seq)).filter((f): f is Finding => f !== null);
}

// --- the request -----------------------------------------------------------

export interface RunAiArgs {
  analysis: FightAnalysis;
  fetchImpl?: typeof fetch;
}

export async function runAiAnalysis({ analysis, fetchImpl = fetch }: RunAiArgs): Promise<AiAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new NoxError('AI_NOT_CONFIGURED');

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const cacheKey = `ai:${analysis.reportCode}:${analysis.fight.id}:${model}`;

  const { value } = await dedupe(
    cacheKey,
    TTL.ai,
    async () => {
      const payload = buildAnalysisPayload(analysis);
      const started = Date.now();

      let response: Response;
      try {
        response = await fetchImpl(OPENAI_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Analyse this pull. The structured analysis payload follows as JSON.\n\n${JSON.stringify(payload)}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (err) {
        recordDiagnostic({
          kind: 'ai',
          ok: false,
          message: `request failed: ${err instanceof Error ? err.message : 'unknown'}`,
          durationMs: Date.now() - started,
        });
        throw new NoxError('AI_ERROR', 'The AI provider could not be reached.');
      }

      const durationMs = Date.now() - started;

      if (response.status === 401 || response.status === 403) {
        recordDiagnostic({
          kind: 'ai',
          ok: false,
          message: `credentials rejected (HTTP ${response.status})`,
          durationMs,
        });
        throw new NoxError('AI_ERROR', 'The AI provider rejected the configured API key.');
      }
      if (response.status === 429) {
        recordDiagnostic({ kind: 'ai', ok: false, message: 'rate limited', durationMs });
        throw new NoxError('AI_ERROR', 'The AI provider is rate limiting requests. Try again shortly.');
      }
      if (!response.ok) {
        recordDiagnostic({ kind: 'ai', ok: false, message: `HTTP ${response.status}`, durationMs });
        throw new NoxError('AI_ERROR', `The AI provider returned HTTP ${response.status}.`);
      }

      const body = (await response.json().catch(() => null)) as
        | { choices?: { message?: { content?: unknown } }[] }
        | null;

      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        recordDiagnostic({ kind: 'ai', ok: false, message: 'empty completion', durationMs });
        throw new NoxError('AI_ERROR', 'The AI provider returned an empty response.');
      }

      const parsed = parseAiJson(content);
      if (!parsed.success || !parsed.data) {
        recordDiagnostic({
          kind: 'ai',
          ok: false,
          message: 'completion did not match the required structure',
          durationMs,
        });
        throw new NoxError('AI_ERROR', 'The AI response did not match the required structure.');
      }

      recordDiagnostic({ kind: 'ai', ok: true, message: `analysis generated with ${model}`, durationMs });

      let counter = 0;
      const seq = () => (counter += 1);
      const context = { reportCode: analysis.reportCode, fightId: analysis.fight.id };
      const raw = parsed.data;

      return {
        pullSummary: sanitizeText(raw.pullSummary, 2000),
        keyFailurePoints: toFindings(raw.keyFailurePoints, context, seq),
        whatWentWell: toFindings(raw.whatWentWell, context, seq),
        deathAnalysis: toFindings(raw.deathAnalysis, context, seq),
        mechanicalIssues: toFindings(raw.mechanicalIssues, context, seq),
        damageAnalysis: toFindings(raw.damageAnalysis, context, seq),
        healingAnalysis: toFindings(raw.healingAnalysis, context, seq),
        utilityAnalysis: toFindings(raw.utilityAnalysis, context, seq),
        playerCoaching: raw.playerCoaching.slice(0, 8).map((block) => ({
          player: sanitizeText(block.player, 60),
          keepDoing: toFindings(block.keepDoing, context, seq),
          fixNext: toFindings(block.fixNext, context, seq),
          watch: toFindings(block.watch, context, seq),
        })),
        nextPullPriorities: raw.nextPullPriorities
          .slice(0, 6)
          .map((p) => sanitizeText(p, 400))
          .filter(Boolean),
        model,
        generatedAt: new Date().toISOString(),
      } satisfies AiAnalysis;
    },
    `ai ${analysis.reportCode}#${analysis.fight.id}`,
  );

  return value;
}

/** Parse the completion, tolerating a stray markdown fence around the JSON. */
export function parseAiJson(content: string) {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '');
  try {
    return rawAnalysisSchema.safeParse(JSON.parse(trimmed));
  } catch {
    return { success: false as const, data: undefined };
  }
}

export const __testing = { toFinding, toFindings, rawAnalysisSchema };
