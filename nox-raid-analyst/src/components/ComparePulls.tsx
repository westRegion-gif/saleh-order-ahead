'use client';

import { useMemo, useState } from 'react';
import type { NoxReport, PullComparison } from '@/lib/types';
import type { SpecComparison } from '@/lib/analysis/comparePulls';
import { formatCompact, formatNumber, formatPercent } from '@/lib/format';
import { DemoBadge, EmptyState, Panel, RoleChip, Section } from './primitives';

export function ComparePulls({
  report,
  currentFightId,
  comparison,
  specComparisons,
  loading,
  error,
  onCompare,
}: {
  report: NoxReport;
  currentFightId: number | null;
  comparison: PullComparison | null;
  specComparisons: SpecComparison[];
  loading: boolean;
  error: string | null;
  onCompare: (a: number, b: number) => void;
}) {
  const current = report.fights.find((f) => f.id === currentFightId) ?? null;

  // Only attempts at the same encounter are comparable.
  const siblings = useMemo(
    () => report.fights.filter((f) => f.isEncounter && f.encounterId === current?.encounterId),
    [report.fights, current?.encounterId],
  );

  const [a, setA] = useState<number | null>(siblings[0]?.id ?? null);
  const [b, setB] = useState<number | null>(currentFightId ?? siblings[1]?.id ?? null);

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Compare Pulls</h1>
        <DemoBadge source={report.source} />
      </div>
      <p className="page-sub">
        {current ? `${siblings.length} attempts at ${current.name} in this report` : 'Select a pull first'}
      </p>

      {siblings.length < 2 ? (
        <Panel>
          <EmptyState
            mark="⇄"
            title="Only one attempt"
            text="This report contains a single attempt at this encounter, so there is nothing to compare it against."
          />
        </Panel>
      ) : (
        <>
          <Section title="SELECT TWO PULLS">
            <Panel>
              <div className="row" style={{ gap: 12 }}>
                <PullSelect label="Pull A" fights={siblings} value={a} onChange={setA} />
                <span className="dim" style={{ fontSize: 18 }}>→</span>
                <PullSelect label="Pull B" fights={siblings} value={b} onChange={setB} />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || a === null || b === null || a === b}
                  onClick={() => a !== null && b !== null && onCompare(a, b)}
                >
                  {loading ? (
                    <>
                      <span className="spinner" /> Comparing
                    </>
                  ) : (
                    'Compare'
                  )}
                </button>
              </div>
              {a === b && a !== null && (
                <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                  Pick two different pulls.
                </p>
              )}
              {error && (
                <div className="callout danger" style={{ marginTop: 12 }}>{error}</div>
              )}
            </Panel>
          </Section>

          {comparison && (
            <>
              <Section title="WHAT CHANGED" note={`${comparison.a.label} → ${comparison.b.label}`}>
                <Panel>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {comparison.narrative.map((line) => (
                      <li key={line} style={{ fontSize: 12.5, marginBottom: 5 }}>{line}</li>
                    ))}
                  </ul>
                </Panel>
              </Section>

              <Section title="RAID METRICS">
                <div className="panel table-wrap">
                  <table className="nox">
                    <thead>
                      <tr>
                        <th>METRIC</th>
                        <th className="num">{comparison.a.label}</th>
                        <th className="num">{comparison.b.label}</th>
                        <th className="num">DELTA</th>
                        <th>TREND</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.metrics.map((metric) => (
                        <tr key={metric.metric}>
                          <td className="name">{metric.metric}</td>
                          <td className="num">{metric.aLabel}</td>
                          <td className="num">{metric.bLabel}</td>
                          <td className={`num delta ${metric.direction}`}>{metric.deltaLabel}</td>
                          <td>
                            <TrendChip direction={metric.direction} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="PLAYER DELTAS" note="Players present in both pulls">
                <div className="panel table-wrap">
                  <table className="nox">
                    <thead>
                      <tr>
                        <th>PLAYER</th>
                        <th>ROLE</th>
                        <th className="num">DPS Δ</th>
                        <th className="num">HPS Δ</th>
                        <th className="num">TAKEN Δ</th>
                        <th className="num">DEATHS Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.playerDeltas.map((row) => (
                        <tr key={row.name}>
                          <td className="name">
                            {row.name}
                            {row.spec && <span className="dim" style={{ fontWeight: 400 }}> · {row.spec}</span>}
                          </td>
                          <td><RoleChip role={row.role} /></td>
                          <td className={`num delta ${row.dps.direction}`}>{row.dps.deltaLabel}</td>
                          <td className={`num delta ${row.hps.direction}`}>{row.hps.deltaLabel}</td>
                          <td className={`num delta ${row.damageTaken.direction}`}>{row.damageTaken.deltaLabel}</td>
                          <td className={`num delta ${row.deaths.direction}`}>{row.deaths.deltaLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
        </>
      )}

      {specComparisons.length > 0 && (
        <Section title="SAME-SPEC COMPARISON" note="Like-for-like only">
          <div className="stack">
            {specComparisons.map((group) => (
              <Panel
                key={`${group.className}-${group.spec}`}
                title={`${group.className} · ${group.spec}`}
                actions={<RoleChip role={group.role} />}
              >
                <div className="callout" style={{ marginBottom: 12 }}>{group.warning}</div>
                <div className="table-wrap">
                  <table className="nox">
                    <thead>
                      <tr>
                        <th>PLAYER</th>
                        <th className="num">DPS</th>
                        <th className="num">HPS</th>
                        <th className="num">TAKEN</th>
                        <th className="num">DEATHS</th>
                        <th className="num">INT</th>
                        <th className="num">DIS</th>
                        <th className="num">ACTIVE</th>
                        <th className="num">CASTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.players.map((p) => (
                        <tr key={p.name}>
                          <td className="name">{p.name}</td>
                          <td className="num">{formatCompact(p.dps)}</td>
                          <td className="num">{formatCompact(p.hps)}</td>
                          <td className="num">{formatCompact(p.damageTaken)}</td>
                          <td className={`num${p.deaths > 0 ? ' row-dead' : ''}`}>{formatNumber(p.deaths)}</td>
                          <td className="num">{formatNumber(p.interrupts)}</td>
                          <td className="num">{formatNumber(p.dispels)}</td>
                          <td className="num">{p.activeTimePct === null ? '—' : formatPercent(p.activeTimePct, 0)}</td>
                          <td className="num">{p.castCount === null ? '—' : formatNumber(p.castCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function PullSelect({
  label,
  fights,
  value,
  onChange,
}: {
  label: string;
  fights: { id: number; attemptNumber: number | null; kill: boolean | null; bossPercentage: number | null }[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="kpi-label">{label}</span>
      <select
        className="input"
        style={{ width: 'auto', minWidth: 190 }}
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {fights.map((fight) => (
          <option key={fight.id} value={fight.id}>
            {fight.attemptNumber ? `Pull ${fight.attemptNumber}` : `Fight ${fight.id}`}
            {' · '}
            {fight.kill ? 'Kill' : `Wipe${fight.bossPercentage !== null ? ` ${fight.bossPercentage.toFixed(1)}%` : ''}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function TrendChip({ direction }: { direction: 'improved' | 'regressed' | 'unchanged' }) {
  const label = direction === 'improved' ? 'Improved' : direction === 'regressed' ? 'Regressed' : 'Unchanged';
  const cls = direction === 'improved' ? 'kill' : direction === 'regressed' ? 'wipe' : '';
  return <span className={`chip ${cls}`}>{label}</span>;
}
