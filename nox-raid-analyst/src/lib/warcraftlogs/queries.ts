/**
 * Static GraphQL documents for Warcraft Logs API v2.
 *
 * These are frozen strings. Caller input is always passed through the
 * `variables` map so a report code can never alter query structure.
 */

/** Report metadata, the full fight list, and the player roster. */
export const REPORT_QUERY = /* GraphQL */ `
  query NoxReport($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        startTime
        endTime
        owner {
          name
        }
        guild {
          name
          server {
            name
            region {
              compactName
            }
          }
        }
        zone {
          id
          name
        }
        fights {
          id
          name
          encounterID
          difficulty
          startTime
          endTime
          kill
          bossPercentage
          fightPercentage
          friendlyPlayers
        }
        masterData {
          abilities {
            gameID
            name
            icon
          }
          actors(type: "Player") {
            id
            name
            type
            subType
            server
          }
        }
      }
    }
  }
`;

/**
 * Role and specialization per player for a given fight. This is the only
 * reliable source of spec, so role/spec is marked unconfirmed when it fails.
 */
export const PLAYER_DETAILS_QUERY = /* GraphQL */ `
  query NoxPlayerDetails($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        playerDetails(fightIDs: $fightIDs)
      }
    }
  }
`;

/** A single summary table (damage, healing, casts, deaths, ...). */
export const TABLE_QUERY = /* GraphQL */ `
  query NoxTable($code: String!, $fightIDs: [Int]!, $dataType: TableDataType!, $hostilityType: HostilityType) {
    reportData {
      report(code: $code) {
        table(fightIDs: $fightIDs, dataType: $dataType, hostilityType: $hostilityType)
      }
    }
  }
`;

/** One page of raw events. `nextPageTimestamp` drives pagination. */
export const EVENTS_QUERY = /* GraphQL */ `
  query NoxEvents(
    $code: String!
    $fightIDs: [Int]!
    $dataType: EventDataType!
    $startTime: Float!
    $endTime: Float!
    $limit: Int
    $targetID: Int
  ) {
    reportData {
      report(code: $code) {
        events(
          fightIDs: $fightIDs
          dataType: $dataType
          startTime: $startTime
          endTime: $endTime
          limit: $limit
          targetID: $targetID
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

/** Remaining API point budget for the current hour. */
export const RATE_LIMIT_QUERY = /* GraphQL */ `
  query NoxRateLimit {
    rateLimitData {
      limitPerHour
      pointsSpentThisHour
      pointsResetIn
    }
  }
`;

/** Warcraft Logs TableDataType values NOX consumes. */
export const TABLE_TYPES = {
  damageDone: 'DamageDone',
  damageTaken: 'DamageTaken',
  healing: 'Healing',
  casts: 'Casts',
  deaths: 'Deaths',
  interrupts: 'Interrupts',
  dispels: 'Dispels',
  summary: 'Summary',
} as const;

/** Warcraft Logs EventDataType values NOX consumes. */
export const EVENT_TYPES = {
  deaths: 'Deaths',
  damageTaken: 'DamageTaken',
  interrupts: 'Interrupts',
  dispels: 'Dispels',
  casts: 'Casts',
} as const;
