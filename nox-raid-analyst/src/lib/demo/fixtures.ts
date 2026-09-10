/**
 * DEMO DATA.
 *
 * This is fabricated, and is labelled as such everywhere it surfaces: every
 * payload built here carries `source: 'demo'`, and the UI renders a DEMO DATA
 * badge whenever it sees that flag. It exists so the interface can be explored
 * without Warcraft Logs credentials.
 *
 * It is deliberately run through the REAL normalizers and the REAL analysis
 * engine rather than being hand-written output, so demo mode exercises the same
 * code path as live data and cannot drift from it.
 */

import type { FightAnalysis, NoxReport } from '@/lib/types';
import {
  applyPlayerDetails,
  normalizeAbilities,
  normalizeReport,
  readTableEntries,
} from '@/lib/warcraftlogs/normalize';
import { buildPlayerStats } from '@/lib/analysis/playerEngine';
import { attachDeathWindow, buildDeaths, toFightRelative } from '@/lib/analysis/deathAnalyzer';
import { buildDamageSources, buildFindings, buildRaidSummary, buildTimeline } from '@/lib/analysis/raidEngine';
import { EvidenceBuilder } from '@/lib/analysis/evidence';
import { warcraftLogsLink } from '@/lib/warcraftlogs/parseReport';

export const DEMO_REPORT_CODE = 'DEMOxxxxDEMOxxxx';

interface DemoPlayer {
  id: number;
  name: string;
  cls: string;
  spec: string;
  bucket: 'tanks' | 'healers' | 'dps';
  dps: number;
  hps: number;
  taken: number;
}

/** A plausible 20-player Mythic roster. Numbers are invented, and labelled so. */
const ROSTER: DemoPlayer[] = [
  { id: 1, name: 'Grimwall', cls: 'Warrior', spec: 'Protection', bucket: 'tanks', dps: 480_000, hps: 40_000, taken: 9_800_000 },
  { id: 2, name: 'Duskhide', cls: 'Druid', spec: 'Guardian', bucket: 'tanks', dps: 445_000, hps: 55_000, taken: 9_100_000 },
  { id: 3, name: 'Lumenae', cls: 'Priest', spec: 'Holy', bucket: 'healers', dps: 62_000, hps: 1_420_000, taken: 1_900_000 },
  { id: 4, name: 'Tidecaller', cls: 'Shaman', spec: 'Restoration', bucket: 'healers', dps: 74_000, hps: 1_310_000, taken: 2_050_000 },
  { id: 5, name: 'Sablevow', cls: 'Priest', spec: 'Holy', bucket: 'healers', dps: 58_000, hps: 1_180_000, taken: 1_760_000 },
  { id: 6, name: 'Verdance', cls: 'Evoker', spec: 'Preservation', bucket: 'healers', dps: 91_000, hps: 1_090_000, taken: 1_640_000 },
  { id: 7, name: 'Nightreave', cls: 'Rogue', spec: 'Assassination', bucket: 'dps', dps: 1_240_000, hps: 0, taken: 2_400_000 },
  { id: 8, name: 'Bladeworn', cls: 'Warrior', spec: 'Fury', bucket: 'dps', dps: 1_190_000, hps: 0, taken: 2_900_000 },
  { id: 9, name: 'Ashfang', cls: 'DeathKnight', spec: 'Unholy', bucket: 'dps', dps: 1_310_000, hps: 0, taken: 2_650_000 },
  { id: 10, name: 'Zephyra', cls: 'Monk', spec: 'Windwalker', bucket: 'dps', dps: 1_080_000, hps: 0, taken: 2_310_000 },
  { id: 11, name: 'Ravenna', cls: 'DemonHunter', spec: 'Havoc', bucket: 'dps', dps: 1_155_000, hps: 0, taken: 2_780_000 },
  { id: 12, name: 'Emberlyn', cls: 'Mage', spec: 'Fire', bucket: 'dps', dps: 1_290_000, hps: 0, taken: 1_450_000 },
  { id: 13, name: 'Voidscribe', cls: 'Warlock', spec: 'Destruction', bucket: 'dps', dps: 1_205_000, hps: 0, taken: 1_390_000 },
  { id: 14, name: 'Starweave', cls: 'Druid', spec: 'Balance', bucket: 'dps', dps: 1_020_000, hps: 45_000, taken: 1_320_000 },
  { id: 15, name: 'Frostmourn', cls: 'Mage', spec: 'Fire', bucket: 'dps', dps: 985_000, hps: 0, taken: 1_280_000 },
  { id: 16, name: 'Hawkeye', cls: 'Hunter', spec: 'Marksmanship', bucket: 'dps', dps: 1_140_000, hps: 0, taken: 1_180_000 },
  { id: 17, name: 'Stormcall', cls: 'Shaman', spec: 'Elemental', bucket: 'dps', dps: 1_065_000, hps: 60_000, taken: 1_410_000 },
  { id: 18, name: 'Duskblade', cls: 'Rogue', spec: 'Assassination', bucket: 'dps', dps: 1_095_000, hps: 0, taken: 2_260_000 },
  { id: 19, name: 'Sanctus', cls: 'Paladin', spec: 'Retribution', bucket: 'dps', dps: 1_110_000, hps: 80_000, taken: 2_540_000 },
  { id: 20, name: 'Nyxaris', cls: 'Evoker', spec: 'Devastation', bucket: 'dps', dps: 1_170_000, hps: 0, taken: 1_500_000 },
];

const ABILITIES = [
  { gameID: 441_001, name: 'Ruinous Cleave', icon: 'ability_warrior_cleave' },
  { gameID: 441_002, name: 'Void Sear', icon: 'spell_shadow_shadowbolt' },
  { gameID: 441_003, name: 'Collapsing Star', icon: 'spell_arcane_starfire' },
  { gameID: 441_004, name: 'Gloom Pool', icon: 'spell_shadow_creepingplague' },
  { gameID: 441_005, name: 'Shackling Roots', icon: 'spell_nature_stranglevines' },
  { gameID: 441_006, name: 'Counterspell', icon: 'spell_frost_iceshock' },
];

interface DemoFightSpec {
  id: number;
  startTime: number;
  durationMs: number;
  kill: boolean;
  bossPct: number;
  /** [actorId, secondsIntoFight, killingAbilityId] */
  deaths: [number, number, number][];
  /** Multiplier applied to every player's output for this pull. */
  outputScale: number;
}

/** Three Mythic pulls that tell a progression story: 2 wipes, then a kill. */
const FIGHT_SPECS: DemoFightSpec[] = [
  {
    id: 11, startTime: 600_000, durationMs: 214_000, kill: false, bossPct: 46.8, outputScale: 0.93,
    deaths: [
      [14, 62, 441_003], [15, 64, 441_003], [12, 66, 441_003],
      [3, 148, 441_002], [8, 171, 441_001], [7, 176, 441_001],
      [11, 180, 441_001], [1, 191, 441_001], [4, 199, 441_002],
    ],
  },
  {
    id: 17, startTime: 1_100_000, durationMs: 268_000, kill: false, bossPct: 18.4, outputScale: 0.98,
    deaths: [
      [15, 118, 441_004], [3, 205, 441_002], [8, 231, 441_001],
      [19, 244, 441_001], [1, 258, 441_001],
    ],
  },
  {
    id: 23, startTime: 1_700_000, durationMs: 301_000, kill: true, bossPct: 0, outputScale: 1.06,
    deaths: [[15, 246, 441_004], [8, 289, 441_001]],
  },
];

function buildRawReport() {
  return {
    code: DEMO_REPORT_CODE,
    title: 'DEMO — Mythic Progression Night',
    startTime: 1_733_000_000_000,
    endTime: 1_733_000_000_000 + 2_100_000,
    owner: { name: 'DemoRaidLead' },
    guild: { name: 'Nox (Demo)', server: { name: 'Silvermoon', region: { compactName: 'EU' } } },
    zone: { id: 9999, name: 'Demo Sanctum' },
    fights: FIGHT_SPECS.map((spec) => ({
      id: spec.id,
      name: 'The Hollow Warden',
      encounterID: 3001,
      difficulty: 5,
      startTime: spec.startTime,
      endTime: spec.startTime + spec.durationMs,
      kill: spec.kill,
      bossPercentage: Math.round(spec.bossPct * 100),
      fightPercentage: Math.round(spec.bossPct * 100),
      friendlyPlayers: ROSTER.map((p) => p.id),
    })),
    masterData: {
      abilities: ABILITIES,
      actors: ROSTER.map((p) => ({
        id: p.id, name: p.name, type: 'Player', subType: p.cls, server: 'Silvermoon',
      })),
    },
  };
}

function buildRawPlayerDetails() {
  const bucketOf = (bucket: DemoPlayer['bucket']) =>
    ROSTER.filter((p) => p.bucket === bucket).map((p) => ({
      id: p.id, name: p.name, type: p.cls, server: 'Silvermoon',
      icon: `${p.cls}-${p.spec}`, specs: [{ spec: p.spec, count: 1 }],
    }));
  return {
    data: {
      playerDetails: {
        tanks: bucketOf('tanks'),
        healers: bucketOf('healers'),
        dps: bucketOf('dps'),
      },
    },
  };
}

/** Deterministic pseudo-variance so the demo does not look machine-flat. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43_758.545;
  return 0.94 + (x - Math.floor(x)) * 0.12;
}

function buildTables(spec: DemoFightSpec) {
  const seconds = spec.durationMs / 1000;
  const scale = spec.outputScale;
  const deadAt = new Map(spec.deaths.map(([id, at]) => [id, at]));

  const damageEntries = ROSTER.map((p) => {
    const alive = Math.min(seconds, deadAt.get(p.id) ?? seconds);
    const rate = p.dps * scale * jitter(p.id + spec.id);
    const total = Math.round(rate * alive);
    return {
      id: p.id, name: p.name, type: p.cls, total,
      activeTime: Math.round(alive * 1000 * 0.94),
      abilities: [
        { name: 'Primary Rotation', guid: 100 + p.id, total: Math.round(total * 0.62), hitCount: Math.round(alive * 1.8), abilityIcon: 'ability_dualwield' },
        { name: 'Cooldown Window', guid: 200 + p.id, total: Math.round(total * 0.26), hitCount: Math.round(alive * 0.4), abilityIcon: 'spell_nature_lightning' },
        { name: 'Filler', guid: 300 + p.id, total: Math.round(total * 0.12), hitCount: Math.round(alive * 1.1), abilityIcon: 'spell_fire_flamebolt' },
      ],
    };
  });

  const healingEntries = ROSTER.filter((p) => p.hps > 0).map((p) => {
    const alive = Math.min(seconds, deadAt.get(p.id) ?? seconds);
    const total = Math.round(p.hps * scale * jitter(p.id * 3 + spec.id) * alive);
    return {
      id: p.id, name: p.name, type: p.cls, total,
      activeTime: Math.round(alive * 1000 * 0.91),
      abilities: [
        { name: 'Direct Heal', guid: 400 + p.id, total: Math.round(total * 0.55), hitCount: Math.round(alive * 0.9), abilityIcon: 'spell_holy_flashheal' },
        { name: 'Periodic Heal', guid: 500 + p.id, total: Math.round(total * 0.45), hitCount: Math.round(alive * 2.4), abilityIcon: 'spell_nature_rejuvenation' },
      ],
    };
  });

  const takenEntries = ROSTER.map((p) => {
    const alive = Math.min(seconds, deadAt.get(p.id) ?? seconds);
    const total = Math.round((p.taken / seconds) * alive * jitter(p.id * 7 + spec.id));
    return {
      id: p.id, name: p.name, total,
      abilities: [
        { name: 'Ruinous Cleave', guid: 441_001, total: Math.round(total * (p.bucket === 'tanks' ? 0.54 : 0.26)), hitCount: 8, abilityIcon: 'ability_warrior_cleave' },
        { name: 'Void Sear', guid: 441_002, total: Math.round(total * 0.3), hitCount: 14, abilityIcon: 'spell_shadow_shadowbolt' },
        { name: 'Gloom Pool', guid: 441_004, total: Math.round(total * 0.16), hitCount: 6, abilityIcon: 'spell_shadow_creepingplague' },
      ],
    };
  });

  const castEntries = ROSTER.map((p) => {
    const alive = Math.min(seconds, deadAt.get(p.id) ?? seconds);
    return {
      id: p.id, name: p.name, total: Math.round(alive * 1.6),
      abilities: [
        { name: 'Primary Rotation', guid: 100 + p.id, total: Math.round(alive * 0.95), abilityIcon: 'ability_dualwield' },
        { name: 'Cooldown Window', guid: 200 + p.id, total: Math.max(1, Math.round(alive / 92)), abilityIcon: 'spell_nature_lightning' },
        { name: 'Defensive', guid: 600 + p.id, total: Math.max(0, Math.round(alive / 130)), abilityIcon: 'spell_holy_devotionaura' },
      ],
    };
  });

  const interruptEntries = [7, 9, 10, 12, 18].map((id, index) => ({
    id, name: ROSTER.find((p) => p.id === id)!.name, total: 3 - (index % 3),
  }));
  const dispelEntries = [3, 4, 5, 6].map((id, index) => ({
    id, name: ROSTER.find((p) => p.id === id)!.name, total: 4 - index,
  }));

  const deathEntries = spec.deaths.map(([id, at, abilityId]) => ({
    id, name: ROSTER.find((p) => p.id === id)!.name,
    type: ROSTER.find((p) => p.id === id)!.cls,
    deathTime: spec.startTime + at * 1000,
    ability: {
      name: ABILITIES.find((a) => a.gameID === abilityId)!.name,
      guid: abilityId,
      abilityIcon: ABILITIES.find((a) => a.gameID === abilityId)!.icon,
    },
  }));

  return {
    damageDone: { data: { entries: damageEntries, totalTime: spec.durationMs } },
    healing: { data: { entries: healingEntries } },
    damageTaken: { data: { entries: takenEntries } },
    casts: { data: { entries: castEntries } },
    interrupts: { data: { entries: interruptEntries } },
    dispels: { data: { entries: dispelEntries } },
    deaths: { data: { entries: deathEntries } },
  };
}

/** Synthetic pre-death damage events for one death. */
function buildDeathEvents(spec: DemoFightSpec, actorId: number, atSeconds: number, abilityId: number) {
  const deathMs = spec.startTime + atSeconds * 1000;
  // Vary per player so the demo does not show one repeated figure everywhere.
  const v = jitter(actorId * 11 + atSeconds);
  const scale = (n: number) => Math.round(n * v);
  return [
    { timestamp: deathMs - Math.round(9_400 * v), type: 'damage', targetID: actorId, abilityGameID: 441_004, amount: scale(118_000), overkill: 0 },
    { timestamp: deathMs - Math.round(6_100 * v), type: 'damage', targetID: actorId, abilityGameID: 441_002, amount: scale(164_000), overkill: 0 },
    { timestamp: deathMs - Math.round(3_300 * v), type: 'damage', targetID: actorId, abilityGameID: 441_002, amount: scale(171_000), overkill: 0 },
    { timestamp: deathMs - 220, type: 'damage', targetID: actorId, abilityGameID: abilityId, amount: scale(1_240_000), overkill: scale(386_000) },
  ];
}

function buildUtilityEvents(spec: DemoFightSpec) {
  const interrupts = [
    { timestamp: spec.startTime + 31_000, sourceID: 9, extraAbilityGameID: 441_002 },
    { timestamp: spec.startTime + 74_000, sourceID: 12, extraAbilityGameID: 441_002 },
    { timestamp: spec.startTime + 129_000, sourceID: 7, extraAbilityGameID: 441_002 },
  ].filter((e) => e.timestamp < spec.startTime + spec.durationMs);

  const dispels = [
    { timestamp: spec.startTime + 45_000, sourceID: 3, extraAbilityGameID: 441_005 },
    { timestamp: spec.startTime + 112_000, sourceID: 4, extraAbilityGameID: 441_005 },
  ].filter((e) => e.timestamp < spec.startTime + spec.durationMs);

  return { interrupts, dispels };
}

let cached: { report: NoxReport; analyses: Map<number, FightAnalysis> } | null = null;

/** Build the demo report and all of its fight analyses (memoised). */
function build() {
  if (cached) return cached;

  const raw = buildRawReport();
  const base = normalizeReport(raw)!;
  const abilities = normalizeAbilities(raw.masterData);
  const actors = applyPlayerDetails(base.actors, buildRawPlayerDetails());

  const report: NoxReport = { ...base, actors, source: 'demo' };
  const analyses = new Map<number, FightAnalysis>();

  for (const spec of FIGHT_SPECS) {
    const fight = report.fights.find((f) => f.id === spec.id)!;
    const tables = buildTables(spec);

    const parsed = {
      damageDone: readTableEntries(tables.damageDone),
      healing: readTableEntries(tables.healing),
      damageTaken: readTableEntries(tables.damageTaken),
      casts: readTableEntries(tables.casts),
      interrupts: readTableEntries(tables.interrupts),
      dispels: readTableEntries(tables.dispels),
    };

    let deaths = buildDeaths({
      entries: readTableEntries(tables.deaths),
      actors,
      fight,
      abilities,
    });

    deaths = deaths.map((death) => {
      const match = spec.deaths.find(([id]) => id === death.actorId);
      if (!match) return death;
      return attachDeathWindow(death, buildDeathEvents(spec, match[0], match[1], match[2]), fight, abilities);
    });

    const deathsByActor = new Map<number, number>();
    for (const death of deaths) {
      deathsByActor.set(death.actorId, (deathsByActor.get(death.actorId) ?? 0) + 1);
    }

    const players = buildPlayerStats({ fight, actors, tables: parsed, deathsByActor });
    const summary = buildRaidSummary({ fight, players, deaths });
    const damageTakenSources = buildDamageSources(parsed.damageTaken);
    const utility = buildUtilityEvents(spec);

    const timeline = buildTimeline({
      fight,
      deaths,
      interruptEvents: utility.interrupts,
      dispelEvents: utility.dispels,
      actors,
      abilityNameFor: (id) => (id === null ? null : (abilities.get(id)?.name ?? null)),
      toRelative: (t) => toFightRelative(t, fight),
    });

    const coverage = {
      damage: true, healing: true, damageTaken: true, casts: true,
      interrupts: true, dispels: true, deaths: true, deathEvents: true,
      notes: ['This is demo data. No Warcraft Logs request was made.'],
    };

    const findings = buildFindings({
      fight, summary, players, deaths,
      damageSources: damageTakenSources,
      coverage,
      evidence: new EvidenceBuilder({ reportCode: DEMO_REPORT_CODE, fightId: fight.id }),
    });

    analyses.set(fight.id, {
      reportCode: DEMO_REPORT_CODE,
      reportTitle: report.title,
      fight,
      summary,
      players,
      deaths,
      damageTakenSources,
      timeline,
      findings,
      coverage,
      reportLink: warcraftLogsLink(DEMO_REPORT_CODE, fight.id),
      source: 'demo',
    });
  }

  cached = { report, analyses };
  return cached;
}

export function getDemoReport(): NoxReport {
  return build().report;
}

export function getDemoAnalysis(fightId: number): FightAnalysis | null {
  return build().analyses.get(fightId) ?? null;
}

export function isDemoCode(code: string): boolean {
  return code.toUpperCase() === DEMO_REPORT_CODE.toUpperCase();
}
