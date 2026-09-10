/**
 * Mock Warcraft Logs payloads shaped like the real API v2 responses.
 * Used for offline testing only — never rendered as if it were live data.
 */

export const REPORT_RAW = {
  code: 'aBcD1234efGH5678',
  title: 'Mythic Progression Night',
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_900_000,
  owner: { name: 'RaidLeader' },
  guild: { name: 'Nox', server: { name: 'Silvermoon', region: { compactName: 'EU' } } },
  zone: { id: 42, name: 'Test Citadel' },
  fights: [
    {
      id: 1,
      name: 'Trash',
      encounterID: 0,
      difficulty: null,
      startTime: 0,
      endTime: 60_000,
      kill: null,
      bossPercentage: null,
      fightPercentage: null,
      friendlyPlayers: [10, 11],
    },
    {
      id: 2,
      name: 'The Gatekeeper',
      encounterID: 2001,
      difficulty: 5,
      startTime: 100_000,
      endTime: 340_000, // 240s
      kill: false,
      bossPercentage: 3150, // 31.50%
      fightPercentage: 3150,
      friendlyPlayers: [10, 11, 12, 13],
    },
    {
      id: 3,
      name: 'The Gatekeeper',
      encounterID: 2001,
      difficulty: 5,
      startTime: 400_000,
      endTime: 700_000, // 300s
      kill: true,
      bossPercentage: 0,
      fightPercentage: 0,
      friendlyPlayers: [10, 11, 12, 13],
    },
  ],
  masterData: {
    abilities: [
      { gameID: 9001, name: 'Shattering Bellow', icon: 'spell_shadow_shadowbolt' },
      { gameID: 9002, name: 'Creeping Rot', icon: 'spell_nature_corrosivebreath' },
      { gameID: 9003, name: 'Kick', icon: 'ability_kick' },
    ],
    actors: [
      { id: 10, name: 'Tankadin', type: 'Player', subType: 'Paladin', server: 'Silvermoon' },
      { id: 11, name: 'Healbot', type: 'Player', subType: 'Priest', server: 'Silvermoon' },
      { id: 12, name: 'Stabby', type: 'Player', subType: 'Rogue', server: 'Silvermoon' },
      { id: 13, name: 'Boomy', type: 'Player', subType: 'Druid', server: 'Silvermoon' },
    ],
  },
};

export const PLAYER_DETAILS_RAW = {
  data: {
    playerDetails: {
      tanks: [
        { id: 10, name: 'Tankadin', type: 'Paladin', server: 'Silvermoon', icon: 'Paladin-Protection', specs: [{ spec: 'Protection', count: 1 }] },
      ],
      healers: [
        { id: 11, name: 'Healbot', type: 'Priest', server: 'Silvermoon', icon: 'Priest-Holy', specs: [{ spec: 'Holy', count: 1 }] },
      ],
      dps: [
        { id: 12, name: 'Stabby', type: 'Rogue', server: 'Silvermoon', icon: 'Rogue-Assassination', specs: [{ spec: 'Assassination', count: 1 }] },
        { id: 13, name: 'Boomy', type: 'Druid', server: 'Silvermoon', icon: 'Druid-Balance', specs: [{ spec: 'Balance', count: 1 }] },
      ],
    },
  },
};

/** 240s fight -> DPS is total/240. */
export const DAMAGE_TABLE_RAW = {
  data: {
    totalTime: 240_000,
    entries: [
      {
        id: 12, name: 'Stabby', type: 'Rogue', total: 2_400_000, activeTime: 228_000,
        abilities: [
          { name: 'Mutilate', guid: 5374, total: 1_400_000, hitCount: 120, abilityIcon: 'ability_rogue_mutilate' },
          { name: 'Envenom', guid: 32645, total: 1_000_000, hitCount: 40, abilityIcon: 'ability_rogue_envenom' },
        ],
      },
      {
        id: 13, name: 'Boomy', type: 'Druid', total: 1_200_000, activeTime: 216_000,
        abilities: [{ name: 'Starfire', guid: 194153, total: 1_200_000, hitCount: 60, abilityIcon: 'spell_arcane_starfire' }],
      },
      {
        id: 10, name: 'Tankadin', type: 'Paladin', total: 480_000, activeTime: 240_000,
        abilities: [{ name: 'Avenger Shield', guid: 31935, total: 480_000, hitCount: 30, abilityIcon: 'spell_holy_avengersshield' }],
      },
      { id: 11, name: 'Healbot', type: 'Priest', total: 0, activeTime: 0, abilities: [] },
    ],
  },
};

export const HEALING_TABLE_RAW = {
  data: {
    entries: [
      {
        id: 11, name: 'Healbot', type: 'Priest', total: 1_800_000, activeTime: 234_000,
        abilities: [{ name: 'Flash Heal', guid: 2061, total: 1_800_000, hitCount: 90, abilityIcon: 'spell_holy_flashheal' }],
      },
      { id: 10, name: 'Tankadin', type: 'Paladin', total: 200_000, activeTime: 240_000, abilities: [] },
    ],
  },
};

export const DAMAGE_TAKEN_TABLE_RAW = {
  data: {
    entries: [
      {
        id: 10, name: 'Tankadin', total: 900_000,
        abilities: [
          { name: 'Shattering Bellow', guid: 9001, total: 700_000, hitCount: 7, abilityIcon: 'spell_shadow_shadowbolt' },
          { name: 'Creeping Rot', guid: 9002, total: 200_000, hitCount: 20, abilityIcon: 'spell_nature_corrosivebreath' },
        ],
      },
      {
        id: 12, name: 'Stabby', total: 300_000,
        abilities: [{ name: 'Shattering Bellow', guid: 9001, total: 300_000, hitCount: 3, abilityIcon: 'spell_shadow_shadowbolt' }],
      },
    ],
  },
};

export const CASTS_TABLE_RAW = {
  data: {
    entries: [
      {
        id: 12, name: 'Stabby', total: 160,
        abilities: [
          { name: 'Mutilate', guid: 5374, total: 120, abilityIcon: 'ability_rogue_mutilate' },
          { name: 'Envenom', guid: 32645, total: 40, abilityIcon: 'ability_rogue_envenom' },
        ],
      },
    ],
  },
};

export const INTERRUPTS_TABLE_RAW = {
  data: { entries: [{ id: 12, name: 'Stabby', total: 3 }] },
};

export const DISPELS_TABLE_RAW = {
  data: { entries: [{ id: 11, name: 'Healbot', total: 2 }] },
};

/** deathTime values are report-relative, matching fight 2 (100_000..340_000). */
export const DEATHS_TABLE_RAW = {
  data: {
    entries: [
      {
        id: 13, name: 'Boomy', type: 'Druid', deathTime: 160_000, // 60s into the fight
        ability: { name: 'Shattering Bellow', guid: 9001, abilityIcon: 'spell_shadow_shadowbolt' },
      },
      {
        id: 12, name: 'Stabby', type: 'Rogue', deathTime: 162_000, // 62s -> clusters with Boomy
        ability: { name: 'Shattering Bellow', guid: 9001, abilityIcon: 'spell_shadow_shadowbolt' },
      },
      {
        id: 11, name: 'Healbot', type: 'Priest', deathTime: 300_000, // 200s
        ability: { name: 'Creeping Rot', guid: 9002, abilityIcon: 'spell_nature_corrosivebreath' },
      },
    ],
  },
};

/** DamageTaken events preceding Boomy's death at report-time 160_000. */
export const DEATH_WINDOW_EVENTS = [
  { timestamp: 152_000, type: 'damage', targetID: 13, sourceID: 99, abilityGameID: 9002, amount: 20_000, overkill: 0 },
  { timestamp: 156_000, type: 'damage', targetID: 13, sourceID: 99, abilityGameID: 9002, amount: 25_000, overkill: 0 },
  { timestamp: 159_800, type: 'damage', targetID: 13, sourceID: 99, abilityGameID: 9001, amount: 400_000, overkill: 120_000 },
  // Belongs to another player; must be filtered out.
  { timestamp: 159_900, type: 'damage', targetID: 12, sourceID: 99, abilityGameID: 9001, amount: 380_000, overkill: 0 },
];

export const INTERRUPT_EVENTS = [
  { timestamp: 130_000, type: 'interrupt', sourceID: 12, targetID: 99, abilityGameID: 9003, extraAbilityGameID: 9001 },
];

export const DISPEL_EVENTS = [
  { timestamp: 145_000, type: 'dispel', sourceID: 11, targetID: 13, abilityGameID: 527, extraAbilityGameID: 9002 },
];
