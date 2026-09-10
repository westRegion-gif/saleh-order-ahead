'use client';

import { useMemo } from 'react';
import type { AiAnalysis, DeathRecord, FightAnalysis, PlayerFightStats } from '@/lib/types';
import { abilityIconUrl, formatCompact, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { DEFENSIVE_INCONCLUSIVE } from '@/lib/analysis/evidence';
import {
  BarRow, ClassName, DemoBadge, FindingList, Kpi, Panel, RoleChip, Section,
} from './primitives';

export function PlayerAnalysis({
  analysis,
  player,
  allAnalyses,
  ai,
  onBack,
  onLoadAttempts,
  loadingAttempts,
}: {
  analysis: FightAnalysis;
  player: PlayerFightStats;
  allAnalyses: FightAnalysis[];
  ai: AiAnalysis | null;
  onBack: () => void;
  onLoadAttempts: () => void;
  loadingAttempts: boolean;
}) {
  const deaths = useMemo(
    () => analysis.deaths.filter((d) => d.actorId === player.actorId),
    [analysis.deaths, player.actorId],
  );

  const timeline = useMemo(
    () => analysis.timeline.filter((e) => e.players.includes(player.name)),
    [analysis.timeline, player.name],
  );

  const coaching = useMemo(
    () => ai?.playerCoaching.find((c) => c.player === player.name) ?? null,
    [ai, player.name],
  );

  // Other attempts at the same encounter that are already loaded.
  const attempts = useMemo(() => {
    return allAnalyses
      .filter((a) => a.fight.encounterId === analysis.fight.encounterId)
      .map((a) => ({ analysis: a, stats: a.players.find((p) => p.name === player.name) ?? null }))
      .filter((entry): entry is { analysis: FightAnalysis; stats: PlayerFightStats } => entry.stats !== null)
      .sort((a, b) => (a.analysis.fight.attemptNumber ?? 0) - (b.analysis.fight.attemptNumber ?? 0));
  }, [allAnalyses, analysis.fight.encounterId, player.name]);

  const totalAttempts = analysis.fight.attemptTotal ?? 1;
  const topDamage = player.damageAbilities[0]?.total ?? 0;
  const topHealing = player.healingAbilities[0]?.total ?? 0;
  const topCasts = player.casts[0]?.casts ?? 0;

  return (
    <div>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 12 }}>
        ← All players
      </button>

      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          <ClassName name={player.name} className={player.className} />
        </h1>
        <RoleChip role={player.role} />
        {player.spec && <span className="chip">{player.spec}</span>}
        {player.className && <span className="chip">{player.className}</span>}
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        {analysis.fight.name}
        {analysis.fight.difficultyLabel ? ` · ${analysis.fight.difficultyLabel}` : ''}
        {analysis.fight.attemptNumber ? ` · Pull ${analysis.fight.attemptNumber}` : ''}
        {' · '}
        {formatDuration(analysis.fight.durationMs)}
      </p>

      <Section title="KEY METRICS">
        <div className="grid grid-kpi">
          <Kpi label="DPS" value={formatCompact(player.dps)} sub={`${formatPercent(player.damageShare, 1)} of raid`} />
          <Kpi label="DAMAGE" value={formatCompact(player.damage)} />
          <Kpi label="HPS" value={formatCompact(player.hps)} sub={`${formatPercent(player.healingShare, 1)} of raid`} />
          <Kpi label="HEALING" value={formatCompact(player.healing)} />
          <Kpi label="DAMAGE TAKEN" value={formatCompact(player.damageTaken)} />
          <Kpi label="DEATHS" value={formatNumber(player.deaths)} tone={player.deaths > 0 ? 'wipe' : undefined} />
          <Kpi label="INTERRUPTS" value={formatNumber(player.interrupts)} />
          <Kpi label="DISPELS" value={formatNumber(player.dispels)} />
          <Kpi
            label="ACTIVE TIME"
            value={player.activeTimePct === null ? '—' : formatPercent(player.activeTimePct, 0)}
            sub={player.activeTimeMs === null ? 'not recorded' : formatDuration(player.activeTimeMs)}
          />
        </div>
      </Section>

      <div className="grid grid-2">
        <Section title="A · OUTPUT">
          <Panel title="Damage by ability">
            {player.damageAbilities.length === 0 ? (
              <Empty text="No damage abilities recorded for this player." />
            ) : (
              player.damageAbilities.slice(0, 10).map((ability) => (
                <BarRow
                  key={`${ability.abilityId ?? ability.name}`}
                  label={<AbilityLabel name={ability.name} icon={ability.icon} />}
                  meta={ability.hits !== null ? `${formatNumber(ability.hits)} hits` : undefined}
                  value={formatCompact(ability.total)}
                  percent={topDamage > 0 ? ((ability.total ?? 0) / topDamage) * 100 : 0}
                />
              ))
            )}
          </Panel>
          {player.healingAbilities.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Panel title="Healing by ability">
                {player.healingAbilities.slice(0, 8).map((ability) => (
                  <BarRow
                    key={`${ability.abilityId ?? ability.name}`}
                    label={<AbilityLabel name={ability.name} icon={ability.icon} />}
                    meta={ability.hits !== null ? `${formatNumber(ability.hits)} hits` : undefined}
                    value={formatCompact(ability.total)}
                    percent={topHealing > 0 ? ((ability.total ?? 0) / topHealing) * 100 : 0}
                    tone="heal"
                  />
                ))}
              </Panel>
            </div>
          )}
        </Section>

        <Section title="B · CASTS" note="Recorded ability usage">
          <Panel>
            {!analysis.coverage.casts ? (
              <Empty text="The casts table could not be retrieved for this pull." />
            ) : player.casts.length === 0 ? (
              <Empty text="Warcraft Logs recorded no casts for this player." />
            ) : (
              player.casts.slice(0, 14).map((ability) => (
                <BarRow
                  key={`${ability.abilityId ?? ability.name}`}
                  label={<AbilityLabel name={ability.name} icon={ability.icon} />}
                  value={`${formatNumber(ability.casts)} casts`}
                  percent={topCasts > 0 ? ((ability.casts ?? 0) / topCasts) * 100 : 0}
                />
              ))
            )}
          </Panel>
        </Section>
      </div>

      <Section title="C · SURVIVAL">
        <Panel>
          {deaths.length === 0 ? (
            <p style={{ fontSize: 12.5, margin: 0, color: 'var(--good)' }}>
              Survived the pull. Took {formatCompact(player.damageTaken)} damage.
            </p>
          ) : (
            deaths.map((death) => <DeathDetail key={`${death.order}`} death={death} />)
          )}
        </Panel>
      </Section>

      <div className="grid grid-2">
        <Section title="D · UTILITY">
          <Panel>
            <div className="grid grid-3">
              <Kpi label="INTERRUPTS" value={formatNumber(player.interrupts)} />
              <Kpi label="DISPELS" value={formatNumber(player.dispels)} />
            </div>
            <p className="dim" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
              {DEFENSIVE_INCONCLUSIVE}
            </p>
          </Panel>
        </Section>

        <Section title="E · TIMELINE" note="Events involving this player">
          <Panel>
            {timeline.length === 0 ? (
              <Empty text="No notable timeline events involved this player." />
            ) : (
              <div className="timeline">
                {timeline.map((event, i) => (
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
      </div>

      <Section
        title="F · PULL COMPARISON"
        note={`${attempts.length} of ${totalAttempts} attempts loaded`}
        actions={
          attempts.length < totalAttempts ? (
            <button type="button" className="btn btn-sm" onClick={onLoadAttempts} disabled={loadingAttempts}>
              {loadingAttempts ? (
                <>
                  <span className="spinner" /> Loading
                </>
              ) : (
                'Load other attempts'
              )}
            </button>
          ) : undefined
        }
      >
        <Panel>
          {attempts.length < 2 ? (
            <Empty text="Load at least two attempts of this encounter to compare this player across pulls." />
          ) : (
            <div className="table-wrap">
              <table className="nox">
                <thead>
                  <tr>
                    <th>PULL</th>
                    <th>RESULT</th>
                    <th className="num">DPS</th>
                    <th className="num">HPS</th>
                    <th className="num">TAKEN</th>
                    <th className="num">DEATHS</th>
                    <th className="num">ACTIVE</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map(({ analysis: a, stats }) => (
                    <tr key={a.fight.id} style={a.fight.id === analysis.fight.id ? { background: 'var(--accent-dim)' } : undefined}>
                      <td className="name">
                        {a.fight.attemptNumber ? `Pull ${a.fight.attemptNumber}` : `Fight ${a.fight.id}`}
                      </td>
                      <td>
                        <span className={`chip ${a.fight.kill ? 'kill' : 'wipe'}`}>
                          {a.fight.kill ? 'Kill' : 'Wipe'}
                        </span>
                      </td>
                      <td className="num">{formatCompact(stats.dps)}</td>
                      <td className="num">{formatCompact(stats.hps)}</td>
                      <td className="num">{formatCompact(stats.damageTaken)}</td>
                      <td className={`num${stats.deaths > 0 ? ' row-dead' : ''}`}>{formatNumber(stats.deaths)}</td>
                      <td className="num">
                        {stats.activeTimePct === null ? '—' : formatPercent(stats.activeTimePct, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Section>

      <Section title="G · AI COACH" note={ai ? `Generated with ${ai.model}` : 'Run the AI Coach to populate this'}>
        {!ai ? (
          <Panel>
            <Empty text="No AI analysis has been run for this pull yet. Open the AI Coach tab to generate one." />
          </Panel>
        ) : !coaching ? (
          <Panel>
            <Empty text={`The AI analysis did not produce coaching for ${player.name}.`} />
          </Panel>
        ) : (
          <div className="grid grid-3">
            <div className="coach-col">
              <div className="coach-title keep">KEEP DOING</div>
              <FindingList findings={coaching.keepDoing} empty="Insufficient evidence." />
            </div>
            <div className="coach-col">
              <div className="coach-title fix">FIX NEXT</div>
              <FindingList findings={coaching.fixNext} empty="Insufficient evidence." />
            </div>
            <div className="coach-col">
              <div className="coach-title watch">WATCH</div>
              <FindingList findings={coaching.watch} empty="Insufficient evidence." />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function DeathDetail({ death }: { death: DeathRecord }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="chip wipe">DEATH #{death.order}</span>
        <span className="mono" style={{ color: 'var(--accent-soft)' }}>{death.timestampLabel}</span>
        {death.killingBlow?.abilityName && (
          <span style={{ fontSize: 12.5 }}>
            Killing blow: <strong>{death.killingBlow.abilityName}</strong>
            {death.killingBlow.amount ? ` for ${formatCompact(death.killingBlow.amount)}` : ''}
          </span>
        )}
      </div>

      {death.windowUnavailable ? (
        <div className="callout">
          The event stream for the seconds before this death could not be retrieved, so only the
          killing blow is known.
        </div>
      ) : death.precedingDamage.length === 0 ? (
        <div className="callout">
          No damage events were recorded in the {death.windowMs / 1000}s before this death.
        </div>
      ) : (
        <>
          <p className="dim" style={{ fontSize: 11.5, margin: '0 0 6px' }}>
            {formatCompact(death.damageInWindow)} taken in the final {death.windowMs / 1000}s
          </p>
          <div className="table-wrap">
            <table className="nox">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>ABILITY</th>
                  <th className="num">AMOUNT</th>
                  <th className="num">OVERKILL</th>
                </tr>
              </thead>
              <tbody>
                {death.precedingDamage.map((event, i) => (
                  <tr key={`${event.timestampMs}-${i}`}>
                    <td className="mono">{event.timestampLabel}</td>
                    <td>{event.abilityName ?? <span className="dim">Unnamed ability</span>}</td>
                    <td className="num">{formatCompact(event.amount)}</td>
                    <td className="num dim">{event.overkill ? formatCompact(event.overkill) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function AbilityLabel({ name, icon }: { name: string; icon: string | null }) {
  const url = abilityIconUrl(icon);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="ability-icon" style={{ width: 18, height: 18 }} loading="lazy" />
      )}
      <span className="bar-name">{name}</span>
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>{text}</p>;
}
