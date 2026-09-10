'use client';

import { useMemo, useState } from 'react';
import type { FightAnalysis } from '@/lib/types';
import { formatDuration, formatNumber } from '@/lib/format';
import { BarRow, DemoBadge, EmptyState, Panel, RoleChip, Section } from './primitives';
import { AbilityLabel } from './PlayerAnalysis';

export function CastAnalysis({ analysis }: { analysis: FightAnalysis }) {
  const withCasts = useMemo(
    () => analysis.players.filter((p) => p.casts.length > 0),
    [analysis.players],
  );
  const [selected, setSelected] = useState<number | null>(withCasts[0]?.actorId ?? null);

  const player = withCasts.find((p) => p.actorId === selected) ?? withCasts[0] ?? null;

  if (!analysis.coverage.casts || withCasts.length === 0) {
    return (
      <div>
        <h1 className="page-title">Cast Analysis</h1>
        <p className="page-sub">{analysis.fight.name}</p>
        <Panel>
          <EmptyState
            mark="⚡"
            title="No cast data"
            text="The casts table could not be retrieved for this pull, so NOX cannot show ability usage."
          />
        </Panel>
      </div>
    );
  }

  const topCasts = player?.casts[0]?.casts ?? 0;

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Cast Analysis</h1>
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        Recorded ability usage over {formatDuration(analysis.fight.durationMs)} · {analysis.fight.name}
      </p>

      <div className="callout info" style={{ marginBottom: 18 }}>
        NOX reports the casts Warcraft Logs recorded. It does not compute a &quot;missed casts&quot; figure,
        because that requires knowing downtime, phase timings, target availability, resource state and
        death timing — none of which can be established reliably from this dataset alone.
      </div>

      <Section title="PLAYER">
        <div className="filter-bar">
          {withCasts.map((p) => (
            <button
              key={p.actorId}
              type="button"
              className="filter-btn"
              aria-pressed={player?.actorId === p.actorId}
              onClick={() => setSelected(p.actorId)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      {player && (
        <Section
          title="ABILITY USAGE"
          note={`${formatNumber(player.casts.reduce((s, c) => s + (c.casts ?? 0), 0))} casts recorded`}
        >
          <Panel
            title={player.name}
            actions={<RoleChip role={player.role} />}
          >
            {player.casts.map((ability) => (
              <BarRow
                key={`${ability.abilityId ?? ability.name}`}
                label={<AbilityLabel name={ability.name} icon={ability.icon} />}
                meta={ability.hits !== null ? `${formatNumber(ability.hits)} hits` : undefined}
                value={`${formatNumber(ability.casts)} casts`}
                percent={topCasts > 0 ? ((ability.casts ?? 0) / topCasts) * 100 : 0}
              />
            ))}
          </Panel>
        </Section>
      )}
    </div>
  );
}
