'use client';

import type { AiAnalysis, FightAnalysis } from '@/lib/types';
import { DemoBadge, EmptyState, FindingList, Panel, Section } from './primitives';

export function AiCoach({
  analysis,
  ai,
  loading,
  error,
  configured,
  onRun,
}: {
  analysis: FightAnalysis;
  ai: AiAnalysis | null;
  loading: boolean;
  error: { message: string; detail: string | null } | null;
  configured: boolean;
  onRun: () => void;
}) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>AI Coach</h1>
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        Interprets the deterministic analysis. It never recalculates numbers and never invents events.
      </p>

      <div className="callout info" style={{ marginBottom: 18 }}>
        Every AI finding below carries an evidence panel drawn from the same normalized dataset the
        rest of NOX uses. Findings that cite no evidence are discarded before they reach this screen.
      </div>

      {!configured ? (
        <Panel>
          <EmptyState
            mark="✦"
            title="AI is not configured"
            text="Set OPENAI_API_KEY in the server environment to enable the AI Coach. Every other part of NOX works without it."
          />
        </Panel>
      ) : !ai ? (
        <Panel>
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p className="dim" style={{ fontSize: 12.5, marginBottom: 16 }}>
              Run an evidence-based analysis of {analysis.fight.name}
              {analysis.fight.attemptNumber ? ` (Pull ${analysis.fight.attemptNumber})` : ''}.
            </p>
            <button type="button" className="btn btn-primary" onClick={onRun} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" /> Analysing pull
                </>
              ) : (
                'Run AI Analysis'
              )}
            </button>
            {error && (
              <div className="callout danger" style={{ marginTop: 16, textAlign: 'left' }}>
                <strong style={{ display: 'block', marginBottom: 3, color: 'var(--high)' }}>{error.message}</strong>
                {error.detail && <span>{error.detail}</span>}
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <>
          <Section title="1 · PULL SUMMARY" note={`${ai.model} · ${new Date(ai.generatedAt).toLocaleString()}`}>
            <Panel>
              <p style={{ fontSize: 13, margin: 0 }}>{ai.pullSummary || 'Insufficient evidence.'}</p>
            </Panel>
          </Section>

          <Section title="2 · KEY FAILURE POINTS">
            <FindingList findings={ai.keyFailurePoints} />
          </Section>

          <Section title="3 · WHAT WENT WELL">
            <FindingList findings={ai.whatWentWell} />
          </Section>

          <Section title="4 · DEATH ANALYSIS">
            <FindingList findings={ai.deathAnalysis} />
          </Section>

          <Section title="5 · MECHANICAL ISSUES">
            <FindingList findings={ai.mechanicalIssues} />
          </Section>

          <div className="grid grid-2">
            <Section title="6 · DAMAGE ANALYSIS">
              <FindingList findings={ai.damageAnalysis} />
            </Section>
            <Section title="7 · HEALING ANALYSIS">
              <FindingList findings={ai.healingAnalysis} />
            </Section>
          </div>

          <Section title="8 · UTILITY ANALYSIS">
            <FindingList findings={ai.utilityAnalysis} />
          </Section>

          <Section title="9 · PLAYER COACHING">
            {ai.playerCoaching.length === 0 ? (
              <Panel><EmptyState mark="—" title="No player coaching" text="Insufficient evidence." /></Panel>
            ) : (
              <div className="stack">
                {ai.playerCoaching.map((block) => (
                  <Panel key={block.player} title={block.player}>
                    <div className="grid grid-3">
                      <div className="coach-col">
                        <div className="coach-title keep">KEEP DOING</div>
                        <FindingList findings={block.keepDoing} />
                      </div>
                      <div className="coach-col">
                        <div className="coach-title fix">FIX NEXT</div>
                        <FindingList findings={block.fixNext} />
                      </div>
                      <div className="coach-col">
                        <div className="coach-title watch">WATCH</div>
                        <FindingList findings={block.watch} />
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </Section>

          <Section title="10 · NEXT PULL PRIORITIES">
            <Panel>
              {ai.nextPullPriorities.length === 0 ? (
                <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Insufficient evidence.</p>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {ai.nextPullPriorities.map((item) => (
                    <li key={item} style={{ fontSize: 13, marginBottom: 6 }}>{item}</li>
                  ))}
                </ol>
              )}
            </Panel>
          </Section>

          <div className="row">
            <button type="button" className="btn btn-sm" onClick={onRun} disabled={loading}>
              {loading ? <><span className="spinner" /> Re-running</> : 'Re-run analysis'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
