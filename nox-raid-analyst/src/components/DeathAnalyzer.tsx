'use client';

import type { FightAnalysis } from '@/lib/types';
import { formatCompact, formatPercent } from '@/lib/format';
import { DEFENSIVE_INCONCLUSIVE } from '@/lib/analysis/evidence';
import { ClassName, DemoBadge, EmptyState, Panel, RoleChip, Section } from './primitives';
import { AbilityLabel } from './PlayerAnalysis';

export function DeathAnalyzer({
  analysis,
  onSelectPlayer,
}: {
  analysis: FightAnalysis;
  onSelectPlayer: (actorId: number) => void;
}) {
  if (analysis.deaths.length === 0) {
    return (
      <div>
        <h1 className="page-title">Death Analyzer</h1>
        <p className="page-sub">{analysis.fight.name}</p>
        <Panel>
          <EmptyState
            mark="✓"
            title="No deaths in this pull"
            text={
              analysis.coverage.deaths
                ? 'Warcraft Logs recorded no deaths for this fight.'
                : 'The deaths table could not be retrieved, so NOX cannot confirm whether anyone died.'
            }
          />
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Death Analyzer</h1>
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        {analysis.deaths.length} deaths · {analysis.fight.name}
        {analysis.summary.firstDeathLabel ? ` · first at ${analysis.summary.firstDeathLabel}` : ''}
      </p>

      <div className="callout" style={{ marginBottom: 18 }}>{DEFENSIVE_INCONCLUSIVE}</div>

      <Section title="DEATH ORDER">
        <div className="stack">
          {analysis.deaths.map((death) => {
            const largest = death.precedingDamage.reduce<number>((max, d) => Math.max(max, d.amount), 0);
            return (
              <div className="panel" key={`${death.actorId}-${death.timestampMs}`}>
                <div className="panel-head">
                  <span className="chip wipe">#{death.order}</span>
                  <h3 className="panel-title">
                    <ClassName name={death.name} className={death.className} />
                  </h3>
                  <RoleChip role={death.role} />
                  {death.spec && <span className="chip">{death.spec}</span>}
                  <span className="mono" style={{ color: 'var(--accent-soft)' }}>{death.timestampLabel}</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onSelectPlayer(death.actorId)}
                  >
                    Player analysis →
                  </button>
                </div>
                <div className="panel-body">
                  <div className="row" style={{ marginBottom: 12, gap: 18 }}>
                    <Stat
                      label="KILLING BLOW"
                      value={death.killingBlow?.abilityName ?? 'Not recorded'}
                    />
                    <Stat
                      label="KILLING BLOW AMOUNT"
                      value={death.killingBlow?.amount ? formatCompact(death.killingBlow.amount) : '—'}
                    />
                    <Stat
                      label={`DAMAGE IN FINAL ${death.windowMs / 1000}s`}
                      value={death.windowUnavailable ? '—' : formatCompact(death.damageInWindow)}
                    />
                  </div>

                  {death.windowUnavailable ? (
                    <div className="callout">
                      The pre-death event window could not be retrieved for this death, so only the
                      killing blow is known.
                    </div>
                  ) : death.precedingDamage.length === 0 ? (
                    <div className="callout">
                      No damage events were recorded in the {death.windowMs / 1000}s before this death.
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table className="nox">
                        <thead>
                          <tr>
                            <th>TIME</th>
                            <th>ABILITY</th>
                            <th>SOURCE</th>
                            <th className="num">AMOUNT</th>
                            <th className="num">SHARE</th>
                            <th className="num">OVERKILL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {death.precedingDamage.map((event, i) => (
                            <tr key={`${event.timestampMs}-${i}`}>
                              <td className="mono">{event.timestampLabel}</td>
                              <td>
                                <AbilityLabel name={event.abilityName ?? 'Unnamed ability'} icon={event.abilityIcon} />
                              </td>
                              <td className="dim">{event.sourceName ?? '—'}</td>
                              <td className="num">{formatCompact(event.amount)}</td>
                              <td className="num dim">
                                {largest > 0 ? formatPercent((event.amount / death.damageInWindow) * 100, 0) : '—'}
                              </td>
                              <td className="num dim">{event.overkill ? formatCompact(event.overkill) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
