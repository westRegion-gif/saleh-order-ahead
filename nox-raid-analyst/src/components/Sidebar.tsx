'use client';

import { NAV_SECTIONS, type ViewId } from '@/lib/client/constants';

export function Sidebar({
  view,
  onView,
  counts,
  hasReport,
  hasFight,
}: {
  view: ViewId;
  onView: (view: ViewId) => void;
  counts: { fights: number | null; players: number | null; deaths: number | null };
  hasReport: boolean;
  hasFight: boolean;
}) {
  const disabledFor = (id: ViewId): boolean => {
    if (id === 'dashboard' || id === 'settings') return false;
    if (id === 'report') return !hasReport;
    return !hasFight;
  };

  const countFor = (id: ViewId): number | null => {
    if (id === 'report') return counts.fights;
    if (id === 'players') return counts.players;
    if (id === 'deaths') return counts.deaths;
    return null;
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">NOX</div>
        <div className="brand-sub">RAID ANALYST</div>
        <div className="brand-tag">FROM THE PULL TO THE PLAYER</div>
      </div>

      <nav className="nav">
        <div className="nav-label">WORKSPACE</div>
        {NAV_SECTIONS.map((item) => {
          const disabled = disabledFor(item.id);
          const count = countFor(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              aria-current={view === item.id}
              disabled={disabled}
              onClick={() => onView(item.id)}
              title={disabled ? 'Load a report and select a pull first' : undefined}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
              {count !== null && <span className="nav-count">{count}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
