'use client';

import { useMemo, useState } from 'react';
import type { NoxFight, NoxReport } from '@/lib/types';
import { formatDuration, formatPercent } from '@/lib/format';

export function FightSelector({
  report,
  selectedId,
  onSelect,
}: {
  report: NoxReport;
  selectedId: number | null;
  onSelect: (fightId: number) => void;
}) {
  const [showTrash, setShowTrash] = useState(false);

  const fights = useMemo(
    () => (showTrash ? report.fights : report.fights.filter((f) => f.isEncounter)),
    [report.fights, showTrash],
  );

  const trashCount = report.fights.length - report.fights.filter((f) => f.isEncounter).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="panel-title">Fights</h3>
        <span className="section-note">{fights.length} shown</span>
        <span className="spacer" />
        {trashCount > 0 && (
          <button
            type="button"
            className="filter-btn"
            aria-pressed={showTrash}
            onClick={() => setShowTrash((v) => !v)}
          >
            {showTrash ? 'Hide' : 'Show'} trash ({trashCount})
          </button>
        )}
      </div>
      <div className="panel-body">
        {fights.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>This report has no boss encounters.</p>
        ) : (
          <div className="fight-list">
            {fights.map((fight) => (
              <FightRow
                key={fight.id}
                fight={fight}
                selected={fight.id === selectedId}
                onSelect={() => onSelect(fight.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FightRow({
  fight,
  selected,
  onSelect,
}: {
  fight: NoxFight;
  selected: boolean;
  onSelect: () => void;
}) {
  const result = fight.kill === true ? 'Kill' : fight.kill === false ? 'Wipe' : 'Trash';
  const meta = [
    fight.difficultyLabel,
    fight.attemptNumber ? `Pull ${fight.attemptNumber}` : null,
    formatDuration(fight.durationMs),
    fight.kill === false && fight.bossPercentage !== null ? formatPercent(fight.bossPercentage) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button type="button" className="fight-item" aria-current={selected} onClick={onSelect}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fight-name">{fight.name}</div>
        <div className="fight-meta">{meta}</div>
      </div>
      {fight.kill !== null && (
        <span className={`chip ${fight.kill ? 'kill' : 'wipe'}`}>{result}</span>
      )}
    </button>
  );
}
