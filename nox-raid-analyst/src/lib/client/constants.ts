export const DEMO_HINT = 'Demo data is fabricated and is labelled DEMO DATA everywhere it appears.';

export const NAV_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'report', label: 'Report', icon: '▤' },
  { id: 'pull', label: 'Pull Analysis', icon: '◎' },
  { id: 'players', label: 'Players', icon: '⛁' },
  { id: 'deaths', label: 'Deaths', icon: '✖' },
  { id: 'casts', label: 'Casts', icon: '⚡' },
  { id: 'compare', label: 'Compare Pulls', icon: '⇄' },
  { id: 'ai', label: 'AI Coach', icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const;

export type ViewId = (typeof NAV_SECTIONS)[number]['id'];
