'use client';

import { useMemo, useState } from 'react';
import type { FightAnalysis, PlayerFightStats, Role } from '@/lib/types';
import { formatCompact, formatNumber, formatPercent } from '@/lib/format';
import { ClassName, DemoBadge, RoleChip, Section } from './primitives';

type SortKey =
  | 'name' | 'role' | 'dps' | 'damage' | 'hps' | 'healing'
  | 'damageTaken' | 'deaths' | 'interrupts' | 'dispels';

const COLUMNS: { key: SortKey; label: string; num: boolean }[] = [
  { key: 'name', label: 'PLAYER', num: false },
  { key: 'role', label: 'ROLE', num: false },
  { key: 'dps', label: 'DPS', num: true },
  { key: 'damage', label: 'DAMAGE', num: true },
  { key: 'hps', label: 'HPS', num: true },
  { key: 'healing', label: 'HEALING', num: true },
  { key: 'damageTaken', label: 'TAKEN', num: true },
  { key: 'deaths', label: 'DEATHS', num: true },
  { key: 'interrupts', label: 'INT', num: true },
  { key: 'dispels', label: 'DIS', num: true },
];

const ROLE_FILTERS: { id: Role | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tank', label: 'Tank' },
  { id: 'healer', label: 'Healer' },
  { id: 'melee', label: 'Melee' },
  { id: 'ranged', label: 'Ranged' },
];

export function PlayersTable({
  analysis,
  onSelectPlayer,
}: {
  analysis: FightAnalysis;
  onSelectPlayer: (actorId: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('dps');
  const [asc, setAsc] = useState(false);
  const [role, setRole] = useState<Role | 'all'>('all');
  const [className, setClassName] = useState<string>('all');
  const [spec, setSpec] = useState<string>('all');

  const classes = useMemo(
    () => [...new Set(analysis.players.map((p) => p.className).filter((c): c is string => Boolean(c)))].sort(),
    [analysis.players],
  );
  const specs = useMemo(
    () =>
      [...new Set(
        analysis.players
          .filter((p) => className === 'all' || p.className === className)
          .map((p) => p.spec)
          .filter((s): s is string => Boolean(s)),
      )].sort(),
    [analysis.players, className],
  );

  const rows = useMemo(() => {
    const filtered = analysis.players.filter((p) => {
      if (role !== 'all' && p.role !== role) return false;
      if (className !== 'all' && p.className !== className) return false;
      if (spec !== 'all' && p.spec !== spec) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'role') return a.role.localeCompare(b.role) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
    return sorted;
  }, [analysis.players, role, className, spec, sortKey, asc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === 'name' || key === 'role');
    }
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Players</h1>
        <DemoBadge source={analysis.source} />
      </div>
      <p className="page-sub">
        {rows.length} of {analysis.players.length} raiders · click any row for the full player analysis
      </p>

      <Section title="FILTERS">
        <div className="filter-bar">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="filter-btn"
              aria-pressed={role === f.id}
              onClick={() => setRole(f.id)}
            >
              {f.label}
            </button>
          ))}
          <span style={{ width: 8 }} />
          <select
            className="input"
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
            value={className}
            onChange={(e) => {
              setClassName(e.target.value);
              setSpec('all');
            }}
            aria-label="Filter by class"
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            aria-label="Filter by specialization"
          >
            <option value="all">All specs</option>
            {specs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Section>

      <div className="panel">
        <div className="table-wrap">
          <table className="nox">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`sortable${col.num ? ' num' : ''}`}
                    onClick={() => toggleSort(col.key)}
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="arrow">{asc ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((player) => (
                <PlayerRow key={player.actorId} player={player} onSelect={() => onSelectPlayer(player.actorId)} />
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="panel-body">
            <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No players match those filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, onSelect }: { player: PlayerFightStats; onSelect: () => void }) {
  return (
    <tr className="clickable" onClick={onSelect}>
      <td className="name">
        <ClassName name={player.name} className={player.className} />
        {player.spec && <span className="dim" style={{ fontWeight: 400 }}> · {player.spec}</span>}
      </td>
      <td><RoleChip role={player.role} /></td>
      <td className="num">{formatCompact(player.dps)}</td>
      <td className="num">
        {formatCompact(player.damage)}
        <span className="dim" style={{ fontSize: 10.5 }}> {formatPercent(player.damageShare, 0)}</span>
      </td>
      <td className="num">{formatCompact(player.hps)}</td>
      <td className="num">{formatCompact(player.healing)}</td>
      <td className="num">{formatCompact(player.damageTaken)}</td>
      <td className={`num${player.deaths > 0 ? ' row-dead' : ''}`}>{formatNumber(player.deaths)}</td>
      <td className="num">{formatNumber(player.interrupts)}</td>
      <td className="num">{formatNumber(player.dispels)}</td>
    </tr>
  );
}
