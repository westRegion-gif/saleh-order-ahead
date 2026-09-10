/** Shared formatting helpers. Used by the server engine and the UI alike. */

/** Milliseconds -> "M:SS" (or "H:MM:SS" past an hour). */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Milliseconds -> "4m 12s" style duration. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

/** 1234567 -> "1.23M". Keeps large combat numbers readable in tables. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return Math.round(value).toLocaleString('en-US');
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatSigned(value: number | null | undefined, format: (n: number) => string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${format(Math.abs(value))}`;
}

/** Warcraft Logs difficulty ids. */
const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'LFR',
  2: 'Normal',
  3: 'Normal',
  4: 'Heroic',
  5: 'Mythic',
  10: 'Normal',
  11: 'Heroic',
  12: 'Mythic',
  14: 'Normal',
  15: 'Heroic',
  16: 'Mythic',
  17: 'LFR',
  18: 'Event',
  23: 'Mythic',
  24: 'Timewalking',
  33: 'Timewalking',
};

export function difficultyLabel(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return DIFFICULTY_LABELS[id] ?? `Difficulty ${id}`;
}

/** Blizzard icon CDN path for a Warcraft Logs icon token. */
export function abilityIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  const clean = icon.replace(/\.(jpg|png)$/i, '');
  if (!/^[A-Za-z0-9_\-]+$/.test(clean)) return null;
  return `https://wow.zamimg.com/images/wow/icons/medium/${clean.toLowerCase()}.jpg`;
}
