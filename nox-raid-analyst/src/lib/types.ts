/**
 * NOX Raid Analyst — normalized domain model.
 *
 * Everything the UI and the AI layer consume is expressed in these types.
 * Raw Warcraft Logs payloads are normalized into this shape on the server so
 * that (a) the browser never receives enormous combat datasets and (b) every
 * displayed number has exactly one derivation path.
 *
 * DATA TRUTH: every field here is either read directly from Warcraft Logs or
 * computed deterministically from Warcraft Logs values. Nothing is invented.
 * A value that cannot be established is `null` — never a guess, never a zero
 * standing in for "unknown".
 */

/** Where a payload came from. Surfaced in the UI as a DEMO DATA badge. */
export type DataSource = 'warcraftlogs' | 'demo';

export type Role = 'tank' | 'healer' | 'melee' | 'ranged' | 'unknown';

export type Severity = 'high' | 'medium' | 'low' | 'info';

// ---------------------------------------------------------------------------
// Report / fights / actors
// ---------------------------------------------------------------------------

export interface ReportGuild {
  name: string;
  server: string | null;
  region: string | null;
}

export interface ReportZone {
  id: number | null;
  name: string | null;
}

export interface NoxActor {
  /** Warcraft Logs actor id, unique within the report. */
  id: number;
  name: string;
  /** e.g. "Warrior", "Priest". Null when the log does not record it. */
  className: string | null;
  /** e.g. "Protection". Null when the spec cannot be determined. */
  spec: string | null;
  role: Role;
  server: string | null;
  /** True when role/spec came from playerDetails rather than being inferred. */
  roleConfirmed: boolean;
}

export interface NoxFight {
  id: number;
  name: string;
  encounterId: number;
  /** Raw Warcraft Logs difficulty id (3=Normal, 4=Heroic, 5=Mythic, 1=LFR...). */
  difficulty: number | null;
  difficultyLabel: string | null;
  /** Milliseconds relative to report start (Warcraft Logs native convention). */
  startTime: number;
  endTime: number;
  durationMs: number;
  /** True = kill, false = wipe, null = not an encounter (trash). */
  kill: boolean | null;
  /** Boss health remaining at end of fight, 0-100. Null when unavailable. */
  bossPercentage: number | null;
  /** Encounter progress percentage, 0-100. Null when unavailable. */
  fightPercentage: number | null;
  friendlyPlayerIds: number[];
  /** encounterId === 0 means trash, not a boss encounter. */
  isEncounter: boolean;
  /** 1-based pull number for this encounter+difficulty within the report. */
  attemptNumber: number | null;
  /** Total pulls of this encounter+difficulty in the report. */
  attemptTotal: number | null;
}

export interface NoxReport {
  code: string;
  title: string;
  owner: string | null;
  guild: ReportGuild | null;
  zone: ReportZone | null;
  /** Absolute epoch milliseconds. */
  startTime: number;
  endTime: number;
  fights: NoxFight[];
  actors: NoxActor[];
  source: DataSource;
}

// ---------------------------------------------------------------------------
// Ability usage
// ---------------------------------------------------------------------------

export interface AbilityUsage {
  /** Warcraft Logs ability guid (spell id). */
  abilityId: number | null;
  name: string;
  /** Warcraft Logs icon token, e.g. "ability_warrior_shieldwall". */
  icon: string | null;
  /** Cast count where the table reports it. Null = not recorded. */
  casts: number | null;
  /** Successful hits/ticks where reported. */
  hits: number | null;
  /** Total amount (damage or healing) attributed to the ability. */
  total: number | null;
}

// ---------------------------------------------------------------------------
// Per-player, per-fight performance
// ---------------------------------------------------------------------------

export interface PlayerFightStats {
  actorId: number;
  name: string;
  className: string | null;
  spec: string | null;
  role: Role;

  damage: number;
  dps: number;
  healing: number;
  hps: number;
  damageTaken: number;
  deaths: number;
  interrupts: number;
  dispels: number;

  /** Milliseconds spent active, when the log records it. */
  activeTimeMs: number | null;
  /** activeTimeMs as a share of fight duration, 0-100. */
  activeTimePct: number | null;

  /** Share of total raid damage, 0-100. */
  damageShare: number;
  /** Share of total raid healing, 0-100. */
  healingShare: number;

  damageAbilities: AbilityUsage[];
  healingAbilities: AbilityUsage[];
  casts: AbilityUsage[];
}

// ---------------------------------------------------------------------------
// Deaths
// ---------------------------------------------------------------------------

export interface DamageEventLite {
  /** Milliseconds relative to fight start. */
  timestampMs: number;
  timestampLabel: string;
  abilityName: string | null;
  abilityId: number | null;
  abilityIcon: string | null;
  sourceName: string | null;
  amount: number;
  overkill: number | null;
  /** true when the log flags the hit as absorbed/mitigated in full. */
  mitigated: number | null;
}

export interface DeathRecord {
  /** 1-based death order within the fight. */
  order: number;
  actorId: number;
  name: string;
  className: string | null;
  spec: string | null;
  role: Role;
  /** Milliseconds relative to fight start. */
  timestampMs: number;
  timestampLabel: string;
  killingBlow: {
    abilityName: string | null;
    abilityId: number | null;
    abilityIcon: string | null;
    sourceName: string | null;
    amount: number | null;
  } | null;
  /** Damage taken in the final seconds, most recent last. */
  precedingDamage: DamageEventLite[];
  /** Sum of precedingDamage amounts. */
  damageInWindow: number;
  /** Length of the reconstructed window, milliseconds. */
  windowMs: number;
  /** True when the event stream for this death could not be retrieved. */
  windowUnavailable: boolean;
}

// ---------------------------------------------------------------------------
// Raid-level analysis
// ---------------------------------------------------------------------------

export interface DamageSource {
  abilityName: string;
  abilityId: number | null;
  abilityIcon: string | null;
  total: number;
  /** Number of individual hits recorded. */
  hits: number | null;
  /** Share of total raid damage taken, 0-100. */
  share: number;
}

export interface TimelineEvent {
  timestampMs: number;
  timestampLabel: string;
  kind: 'death' | 'multi-death' | 'damage-spike' | 'interrupt' | 'dispel' | 'phase' | 'fight-end';
  severity: Severity;
  title: string;
  detail: string;
  /** Players involved, when applicable. */
  players: string[];
}

export interface RaidSummary {
  fightId: number;
  encounter: string;
  difficultyLabel: string | null;
  durationMs: number;
  durationLabel: string;
  kill: boolean | null;
  bossPercentage: number | null;
  raidDamage: number;
  raidDps: number;
  raidHealing: number;
  raidHps: number;
  raidDamageTaken: number;
  deaths: number;
  interrupts: number;
  dispels: number;
  playerCount: number;
  /** Milliseconds into the fight of the first death, null when nobody died. */
  firstDeathMs: number | null;
  firstDeathLabel: string | null;
  firstDeathPlayer: string | null;
  composition: { tanks: number; healers: number; melee: number; ranged: number; unknown: number };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceCategory =
  | 'damage'
  | 'healing'
  | 'death'
  | 'damage-taken'
  | 'interrupt'
  | 'dispel'
  | 'cast'
  | 'timeline'
  | 'comparison'
  | 'composition';

/**
 * A single traceable fact. Every finding shown to a user must carry at least
 * one of these, and each one must be reproducible from the normalized dataset.
 */
export interface Evidence {
  id: string;
  source: 'WARCRAFT LOGS';
  category: EvidenceCategory;
  /** Milliseconds relative to fight start, when the fact is time-anchored. */
  timestampMs?: number;
  timestampLabel?: string;
  player?: string;
  ability?: string;
  /** Human label for what was measured, e.g. "DPS", "Damage taken". */
  metric: string;
  /** Formatted value shown to the user. */
  value: string;
  /** Underlying numeric value, for reproducibility. */
  rawValue?: number;
  /** Deep link back to the originating Warcraft Logs fight. */
  reportLink?: string;
}

export interface Finding {
  severity: Severity;
  title: string;
  finding: string;
  evidence: Evidence[];
  recommendation: string | null;
}

// ---------------------------------------------------------------------------
// Full analysed fight (the server's response to the client)
// ---------------------------------------------------------------------------

export interface DataCoverage {
  /** Which optional datasets were successfully retrieved for this fight. */
  damage: boolean;
  healing: boolean;
  damageTaken: boolean;
  casts: boolean;
  interrupts: boolean;
  dispels: boolean;
  deaths: boolean;
  deathEvents: boolean;
  /** Human-readable notes about anything that could not be retrieved. */
  notes: string[];
}

export interface FightAnalysis {
  reportCode: string;
  reportTitle: string;
  fight: NoxFight;
  summary: RaidSummary;
  players: PlayerFightStats[];
  deaths: DeathRecord[];
  damageTakenSources: DamageSource[];
  timeline: TimelineEvent[];
  findings: Finding[];
  coverage: DataCoverage;
  reportLink: string;
  source: DataSource;
}

// ---------------------------------------------------------------------------
// Pull comparison
// ---------------------------------------------------------------------------

export type TrendDirection = 'improved' | 'regressed' | 'unchanged';

export interface MetricDelta {
  metric: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  deltaPct: number | null;
  direction: TrendDirection;
  /** Formatted for display. */
  aLabel: string;
  bLabel: string;
  deltaLabel: string;
  /** True when a higher number is the better outcome. */
  higherIsBetter: boolean;
}

export interface PullComparison {
  a: { fightId: number; label: string; attemptNumber: number | null };
  b: { fightId: number; label: string; attemptNumber: number | null };
  metrics: MetricDelta[];
  playerDeltas: {
    name: string;
    role: Role;
    spec: string | null;
    dps: MetricDelta;
    hps: MetricDelta;
    damageTaken: MetricDelta;
    deaths: MetricDelta;
  }[];
  narrative: string[];
}

// ---------------------------------------------------------------------------
// AI layer
// ---------------------------------------------------------------------------

export interface AiCoachingBlock {
  player: string;
  keepDoing: Finding[];
  fixNext: Finding[];
  watch: Finding[];
}

export interface AiAnalysis {
  pullSummary: string;
  keyFailurePoints: Finding[];
  whatWentWell: Finding[];
  deathAnalysis: Finding[];
  mechanicalIssues: Finding[];
  damageAnalysis: Finding[];
  healingAnalysis: Finding[];
  utilityAnalysis: Finding[];
  playerCoaching: AiCoachingBlock[];
  nextPullPriorities: string[];
  /** Model identifier that produced the analysis. */
  model: string;
  generatedAt: string;
}
