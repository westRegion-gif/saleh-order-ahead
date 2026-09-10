'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiAnalysis, FightAnalysis, NoxReport, PullComparison } from '@/lib/types';
import type { SpecComparison } from '@/lib/analysis/comparePulls';
import {
  errorOf, isAbort, loadAi, loadComparison, loadFight, loadReport, loadStatus,
} from '@/lib/client/api';
import { type ViewId } from '@/lib/client/constants';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { ReportLoader } from '@/components/ReportLoader';
import { ReportView } from '@/components/ReportView';
import { PullAnalysis } from '@/components/PullAnalysis';
import { PlayersTable } from '@/components/PlayersTable';
import { PlayerAnalysis } from '@/components/PlayerAnalysis';
import { DeathAnalyzer } from '@/components/DeathAnalyzer';
import { CastAnalysis } from '@/components/CastAnalysis';
import { ComparePulls } from '@/components/ComparePulls';
import { AiCoach } from '@/components/AiCoach';
import { SettingsView } from '@/components/SettingsView';
import { EmptyState, Panel, SkeletonKpis, SkeletonRows } from '@/components/primitives';
import { DEMO_HINT } from '@/lib/client/constants';

interface UiError {
  message: string;
  detail: string | null;
}

const DEMO_CODE = 'DEMOxxxxDEMOxxxx';

export default function Workspace() {
  const [view, setView] = useState<ViewId>('dashboard');

  const [report, setReport] = useState<NoxReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<UiError | null>(null);

  const [selectedFightId, setSelectedFightId] = useState<number | null>(null);
  const [analyses, setAnalyses] = useState<Map<number, FightAnalysis>>(new Map());
  const [specComparisons, setSpecComparisons] = useState<Map<number, SpecComparison[]>>(new Map());
  const [fightLoading, setFightLoading] = useState(false);
  const [fightError, setFightError] = useState<UiError | null>(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const [aiByFight, setAiByFight] = useState<Map<number, AiAnalysis>>(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<UiError | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  const [comparison, setComparison] = useState<PullComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // One controller per concern, so switching pulls cancels only fight work.
  const reportAbort = useRef<AbortController | null>(null);
  const fightAbort = useRef<AbortController | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const compareAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal)
      .then((status) => setAiConfigured(status.openai.connected))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Abort everything still in flight when the workspace unmounts.
  useEffect(() => {
    return () => {
      reportAbort.current?.abort();
      fightAbort.current?.abort();
      aiAbort.current?.abort();
      compareAbort.current?.abort();
    };
  }, []);

  const analysis = selectedFightId !== null ? (analyses.get(selectedFightId) ?? null) : null;
  const ai = selectedFightId !== null ? (aiByFight.get(selectedFightId) ?? null) : null;
  const currentSpecComparisons = selectedFightId !== null ? (specComparisons.get(selectedFightId) ?? []) : [];

  const selectedPlayer = useMemo(() => {
    if (!analysis || selectedPlayerId === null) return null;
    return analysis.players.find((p) => p.actorId === selectedPlayerId) ?? null;
  }, [analysis, selectedPlayerId]);

  const allAnalyses = useMemo(() => [...analyses.values()], [analyses]);

  /** Fetch a fight analysis unless it is already loaded. */
  const ensureFight = useCallback(
    async (code: string, fightId: number, signal: AbortSignal): Promise<FightAnalysis | null> => {
      const existing = analyses.get(fightId);
      if (existing) return existing;
      const { analysis: loaded, specComparisons: specs } = await loadFight(code, fightId, signal);
      setAnalyses((prev) => new Map(prev).set(fightId, loaded));
      setSpecComparisons((prev) => new Map(prev).set(fightId, specs));
      return loaded;
    },
    [analyses],
  );

  const selectFight = useCallback(
    async (fightId: number) => {
      if (!report) return;
      setSelectedFightId(fightId);
      setSelectedPlayerId(null);
      setComparison(null);
      setFightError(null);
      setView('pull');

      if (analyses.has(fightId)) return;

      fightAbort.current?.abort();
      const controller = new AbortController();
      fightAbort.current = controller;
      setFightLoading(true);
      try {
        await ensureFight(report.code, fightId, controller.signal);
      } catch (err) {
        if (!isAbort(err)) setFightError(errorOf(err));
      } finally {
        if (!controller.signal.aborted) setFightLoading(false);
      }
    },
    [report, analyses, ensureFight],
  );

  const handleLoadReport = useCallback(
    async (input: string) => {
      reportAbort.current?.abort();
      const controller = new AbortController();
      reportAbort.current = controller;

      setReportLoading(true);
      setReportError(null);
      setReport(null);
      setAnalyses(new Map());
      setSpecComparisons(new Map());
      setAiByFight(new Map());
      setSelectedFightId(null);
      setSelectedPlayerId(null);
      setComparison(null);

      try {
        const { report: loaded, defaultFightId } = await loadReport(input, controller.signal);
        setReport(loaded);
        setView('report');

        if (defaultFightId !== null) {
          setSelectedFightId(defaultFightId);
          setFightLoading(true);
          try {
            const { analysis: fight, specComparisons: specs } = await loadFight(
              loaded.code, defaultFightId, controller.signal,
            );
            setAnalyses(new Map([[defaultFightId, fight]]));
            setSpecComparisons(new Map([[defaultFightId, specs]]));
            setView('pull');
          } catch (err) {
            if (!isAbort(err)) setFightError(errorOf(err));
          } finally {
            if (!controller.signal.aborted) setFightLoading(false);
          }
        }
      } catch (err) {
        if (!isAbort(err)) setReportError(errorOf(err));
      } finally {
        if (!controller.signal.aborted) setReportLoading(false);
      }
    },
    [],
  );

  const handleSelectPlayer = useCallback((actorId: number) => {
    setSelectedPlayerId(actorId);
    setView('players');
  }, []);

  const handleRunAi = useCallback(async () => {
    if (!report || selectedFightId === null) return;
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;

    setAiLoading(true);
    setAiError(null);
    try {
      const { ai: result } = await loadAi(report.code, selectedFightId, controller.signal);
      setAiByFight((prev) => new Map(prev).set(selectedFightId, result));
    } catch (err) {
      if (!isAbort(err)) setAiError(errorOf(err));
    } finally {
      if (!controller.signal.aborted) setAiLoading(false);
    }
  }, [report, selectedFightId]);

  const handleCompare = useCallback(
    async (a: number, b: number) => {
      if (!report) return;
      compareAbort.current?.abort();
      const controller = new AbortController();
      compareAbort.current = controller;

      setCompareLoading(true);
      setCompareError(null);
      try {
        const { comparison: result } = await loadComparison(report.code, a, b, controller.signal);
        setComparison(result);
      } catch (err) {
        if (!isAbort(err)) setCompareError(errorOf(err).message);
      } finally {
        if (!controller.signal.aborted) setCompareLoading(false);
      }
    },
    [report],
  );

  /** Load every remaining attempt at the current encounter, for player comparison. */
  const handleLoadAttempts = useCallback(async () => {
    if (!report || !analysis) return;
    const siblings = report.fights.filter(
      (f) => f.isEncounter && f.encounterId === analysis.fight.encounterId && !analyses.has(f.id),
    );
    if (siblings.length === 0) return;

    const controller = new AbortController();
    setAttemptsLoading(true);
    try {
      // Sequential on purpose: each pull costs Warcraft Logs API points.
      for (const fight of siblings) {
        await ensureFight(report.code, fight.id, controller.signal);
      }
    } catch (err) {
      if (!isAbort(err)) setFightError(errorOf(err));
    } finally {
      setAttemptsLoading(false);
    }
  }, [report, analysis, analyses, ensureFight]);

  const handleReset = useCallback(() => {
    reportAbort.current?.abort();
    fightAbort.current?.abort();
    aiAbort.current?.abort();
    compareAbort.current?.abort();
    setReport(null);
    setAnalyses(new Map());
    setSpecComparisons(new Map());
    setAiByFight(new Map());
    setSelectedFightId(null);
    setSelectedPlayerId(null);
    setComparison(null);
    setReportError(null);
    setFightError(null);
    setView('dashboard');
  }, []);

  return (
    <div className="shell">
      <Sidebar
        view={view}
        onView={setView}
        counts={{
          fights: report?.fights.filter((f) => f.isEncounter).length ?? null,
          players: analysis?.players.length ?? null,
          deaths: analysis?.deaths.length ?? null,
        }}
        hasReport={report !== null}
        hasFight={analysis !== null}
      />

      <div className="main">
        <TopBar report={report} analysis={analysis} loading={reportLoading || fightLoading} onReset={handleReset} />

        <div className="content">
          {view === 'dashboard' && (
            <Dashboard
              report={report}
              onLoad={handleLoadReport}
              loading={reportLoading}
              error={reportError}
              onDemo={() => handleLoadReport(DEMO_CODE)}
              onOpenReport={() => setView('report')}
            />
          )}

          {view === 'report' && report && (
            <ReportView report={report} selectedFightId={selectedFightId} onSelectFight={selectFight} />
          )}

          {view === 'pull' && (
            <FightGate loading={fightLoading} error={fightError} analysis={analysis}>
              {analysis && <PullAnalysis analysis={analysis} />}
            </FightGate>
          )}

          {view === 'players' && (
            <FightGate loading={fightLoading} error={fightError} analysis={analysis}>
              {analysis && selectedPlayer ? (
                <PlayerAnalysis
                  analysis={analysis}
                  player={selectedPlayer}
                  allAnalyses={allAnalyses}
                  ai={ai}
                  onBack={() => setSelectedPlayerId(null)}
                  onLoadAttempts={handleLoadAttempts}
                  loadingAttempts={attemptsLoading}
                />
              ) : analysis ? (
                <PlayersTable analysis={analysis} onSelectPlayer={handleSelectPlayer} />
              ) : null}
            </FightGate>
          )}

          {view === 'deaths' && (
            <FightGate loading={fightLoading} error={fightError} analysis={analysis}>
              {analysis && <DeathAnalyzer analysis={analysis} onSelectPlayer={handleSelectPlayer} />}
            </FightGate>
          )}

          {view === 'casts' && (
            <FightGate loading={fightLoading} error={fightError} analysis={analysis}>
              {analysis && <CastAnalysis analysis={analysis} />}
            </FightGate>
          )}

          {view === 'compare' && report && (
            <ComparePulls
              report={report}
              currentFightId={selectedFightId}
              comparison={comparison}
              specComparisons={currentSpecComparisons}
              loading={compareLoading}
              error={compareError}
              onCompare={handleCompare}
            />
          )}

          {view === 'ai' && (
            <FightGate loading={fightLoading} error={fightError} analysis={analysis}>
              {analysis && (
                <AiCoach
                  analysis={analysis}
                  ai={ai}
                  loading={aiLoading}
                  error={aiError}
                  configured={aiConfigured}
                  onRun={handleRunAi}
                />
              )}
            </FightGate>
          )}

          {view === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  );
}

/** Renders skeletons while a pull loads, and errors without losing the shell. */
function FightGate({
  loading,
  error,
  analysis,
  children,
}: {
  loading: boolean;
  error: UiError | null;
  analysis: FightAnalysis | null;
  children: React.ReactNode;
}) {
  if (loading && !analysis) {
    return (
      <div>
        <div className="skeleton" style={{ height: 22, width: 240, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 13, width: 340, marginBottom: 22 }} />
        <SkeletonKpis />
        <div style={{ height: 22 }} />
        <Panel><SkeletonRows /></Panel>
      </div>
    );
  }

  if (error) {
    return (
      <Panel>
        <div className="callout danger">
          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--high)' }}>{error.message}</strong>
          {error.detail && <span>{error.detail}</span>}
        </div>
      </Panel>
    );
  }

  if (!analysis) {
    return (
      <Panel>
        <EmptyState
          mark="◎"
          title="No pull selected"
          text="Load a report and choose a pull to analyse."
        />
      </Panel>
    );
  }

  return <>{children}</>;
}

function Dashboard({
  report,
  onLoad,
  loading,
  error,
  onDemo,
  onOpenReport,
}: {
  report: NoxReport | null;
  onLoad: (input: string) => void;
  loading: boolean;
  error: UiError | null;
  onDemo: () => void;
  onOpenReport: () => void;
}) {
  return (
    <div>
      <ReportLoader onLoad={onLoad} loading={loading} error={error} onDemo={onDemo} />

      {report && (
        <div style={{ marginTop: 18 }}>
          <Panel title="Loaded report">
            <div className="row">
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{report.title}</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {report.fights.filter((f) => f.isEncounter).length} encounters · {report.actors.length} raiders
                </div>
              </div>
              <span className="spacer" />
              <button type="button" className="btn btn-primary btn-sm" onClick={onOpenReport}>
                Open report →
              </button>
            </div>
          </Panel>
        </div>
      )}

      <div style={{ marginTop: 18 }} className="grid grid-3">
        <Panel title="How NOX works">
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--text-dim)' }}>
            <li style={{ marginBottom: 5 }}>Paste a public Warcraft Logs report URL.</li>
            <li style={{ marginBottom: 5 }}>Pick a pull. NOX fetches only that pull&apos;s combat data.</li>
            <li style={{ marginBottom: 5 }}>Read the deterministic analysis — every number is traceable.</li>
            <li>Optionally run the AI Coach to interpret the evidence.</li>
          </ol>
        </Panel>
        <Panel title="What NOX will not do">
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--text-dim)' }}>
            <li style={{ marginBottom: 5 }}>Invent casts, deaths, mechanics or numbers.</li>
            <li style={{ marginBottom: 5 }}>Grade players on raw DPS alone.</li>
            <li style={{ marginBottom: 5 }}>Claim a defensive was wasted without proof.</li>
            <li>Show a conclusion without its evidence.</li>
          </ul>
        </Panel>
        <Panel title="Demo mode">
          <p style={{ fontSize: 12.5, marginTop: 0, color: 'var(--text-dim)' }}>{DEMO_HINT}</p>
          <button type="button" className="btn btn-sm" onClick={onDemo} disabled={loading}>
            Load demo report
          </button>
        </Panel>
      </div>
    </div>
  );
}
