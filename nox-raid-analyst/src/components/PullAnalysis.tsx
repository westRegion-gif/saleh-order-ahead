'use client';

import type { FightAnalysis } from '@/lib/types';
import { formatCompact, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { BarRow, Coverage, DemoBadge, FindingList, Kpi, Panel, Section } from './primitives';

export function PullAnalysis({ analysis }: { analysis: FightAnalysis }) {
  const s = analysis.summary;
  const killed = analysis.fight.kill === true;

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {analysis.fight.name}
        </h1>
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        {[
          analysis.fight.difficultyLabel,
          analysis.fight.attemptNumber
            ? `Pull ${analysis.fight.attemptNumber}${analysis.fight.attemptTotal ? ` of ${analysis.fight.attemptTotal}` : ''}`
            : null,
          `${s.playerCount} raiders`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <Section title="PULL METRICS">
        <div className="grid grid-kpi">
          <Kpi label="DURATION" value={formatDuration(s.durationMs)} />
          <Kpi
            label="RESULT"
            value={analysis.fight.kill === null ? 'N/A' : killed ? 'KILL' : 'WIPE'}
            tone={analysis.fight.kill === null ? undefined : killed ? 'kill' : 'wipe'}
          />
          <Kpi
            label="BOSS %"
            value={s.bossPercentage === null ? '—' : formatPercent(s.bossPercentage)}
            sub={s.bossPercentage === null ? 'Not recorded' : 'health remaining'}
          />
          <Kpi label="RAID DPS" value={formatCompact(s.raidDps)} sub={`${formatCompact(s.raidDamage)} total`} />
          <Kpi label="RAID HPS" value={formatCompact(s.raidHps)} sub={`${formatCompact(s.raidHealing)} total`} />
          <Kpi
            label="DEATHS"
            value={formatNumber(s.deaths)}
            sub={s.firstDeathLabel ? `first at ${s.firstDeathLabel}` : 'none'}
          />
          <Kpi label="INTERRUPTS" value={analysis.coverage.interrupts ? formatNumber(s.interrupts) : '—'} />
          <Kpi label="DISPELS" value={analysis.coverage.dispels ? formatNumber(s.dispels) : '—'} />
        </div>
        <Coverage notes={analysis.coverage.notes} />
      </Section>

      <div className="grid grid-2">
        <Section title="PULL STORY" note="Meaningful events only">
          <Panel>
            {analysis.timeline.length === 0 ? (
              <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No notable events were recorded.</p>
            ) : (
              <div className="timeline">
                {analysis.timeline.map((event, i) => (
                  <div className="tl-item" key={`${event.kind}-${event.timestampMs}-${i}`}>
                    <span className={`tl-dot ${event.severity}`} />
                    <div className="tl-head">
                      <span className="tl-time">{event.timestampLabel}</span>
                      <span className="tl-title">{event.title}</span>
                    </div>
                    <div className="tl-detail">{event.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </Section>

        <Section title="INCOMING DAMAGE" note="What hit the raid hardest">
          <Panel>
            {analysis.damageTakenSources.length === 0 ? (
              <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
                The damage-taken table was not available for this pull.
              </p>
            ) : (
              analysis.damageTakenSources.map((source) => (
                <BarRow
                  key={`${source.abilityId ?? source.abilityName}`}
                  label={source.abilityName}
                  meta={source.hits !== null ? `${source.hits} hits` : undefined}
                  value={`${formatCompact(source.total)} · ${formatPercent(source.share, 0)}`}
                  percent={source.share}
                  tone="danger"
                />
              ))
            )}
          </Panel>
        </Section>
      </div>

      <Section title="DETERMINISTIC FINDINGS" note="Computed from the log, no AI involved">
        <FindingList
          findings={analysis.findings}
          empty="Nothing in this pull met the thresholds for an automatic finding."
        />
      </Section>
    </div>
  );
}
