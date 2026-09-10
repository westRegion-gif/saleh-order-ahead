'use client';

import type { FightAnalysis, NoxReport } from '@/lib/types';
import { DemoBadge } from './primitives';

export function TopBar({
  report,
  analysis,
  loading,
  onReset,
}: {
  report: NoxReport | null;
  analysis: FightAnalysis | null;
  loading: boolean;
  onReset: () => void;
}) {
  const crumbs: { label: string; value: string }[] = [];

  if (report) {
    crumbs.push({ label: 'REPORT', value: report.title });
    if (report.zone?.name) crumbs.push({ label: 'RAID', value: report.zone.name });
  }
  if (analysis) {
    crumbs.push({ label: 'BOSS', value: analysis.fight.name });
    crumbs.push({
      label: 'PULL',
      value: analysis.fight.attemptNumber
        ? `${analysis.fight.attemptNumber}${analysis.fight.attemptTotal ? ` / ${analysis.fight.attemptTotal}` : ''}`
        : `Fight ${analysis.fight.id}`,
    });
    if (analysis.fight.difficultyLabel) {
      crumbs.push({ label: 'DIFFICULTY', value: analysis.fight.difficultyLabel });
    }
  }

  return (
    <header className="topbar">
      {crumbs.length === 0 ? (
        <div className="crumb">
          <span className="crumb-label">STATUS</span>
          <span className="crumb-value dim">No report loaded</span>
        </div>
      ) : (
        <div className="topbar-crumbs">
          {crumbs.map((crumb, i) => (
            <div key={crumb.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {i > 0 && <span className="crumb-sep" />}
              <div className="crumb">
                <span className="crumb-label">{crumb.label}</span>
                <span className="crumb-value">{crumb.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="topbar-right">
        {loading && <span className="spinner" aria-label="Loading" />}
        {report && <DemoBadge source={report.source} />}
        {analysis && (
          <a className="btn btn-sm btn-ghost" href={analysis.reportLink} target="_blank" rel="noopener noreferrer">
            Warcraft Logs ↗
          </a>
        )}
        {report && (
          <button type="button" className="btn btn-sm" onClick={onReset}>
            New report
          </button>
        )}
      </div>
    </header>
  );
}
