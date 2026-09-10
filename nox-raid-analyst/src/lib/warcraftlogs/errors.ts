/**
 * Typed error taxonomy. Every failure the user can hit maps to one of these,
 * so the UI can show an actionable message instead of a stack trace.
 */

export type NoxErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_URL'
  | 'INVALID_REPORT_CODE'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_PRIVATE'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'GRAPHQL_ERROR'
  | 'NO_FIGHTS'
  | 'FIGHT_NOT_FOUND'
  | 'NO_PLAYER_DATA'
  | 'AI_NOT_CONFIGURED'
  | 'AI_ERROR'
  | 'BAD_REQUEST'
  | 'INTERNAL';

/** Message shown to the user. Never contains upstream secrets. */
const USER_MESSAGE: Record<NoxErrorCode, string> = {
  NOT_CONFIGURED:
    'Warcraft Logs credentials are not configured on the server. Set WARCRAFTLOGS_CLIENT_ID and WARCRAFTLOGS_CLIENT_SECRET.',
  INVALID_URL: 'That does not look like a Warcraft Logs report URL.',
  INVALID_REPORT_CODE: 'The report code in that URL is not valid.',
  REPORT_NOT_FOUND: 'Warcraft Logs has no report with that code.',
  REPORT_PRIVATE:
    'That report is private. NOX can only read public reports with the current credentials.',
  AUTH_FAILED: 'Warcraft Logs rejected the API credentials. Check the client id and secret.',
  RATE_LIMITED: 'Warcraft Logs API point limit reached. Wait for the hourly window to reset.',
  UPSTREAM_UNAVAILABLE: 'Warcraft Logs is unreachable right now.',
  GRAPHQL_ERROR: 'Warcraft Logs returned an error for that query.',
  NO_FIGHTS: 'That report contains no fights to analyse.',
  FIGHT_NOT_FOUND: 'That fight is not part of this report.',
  NO_PLAYER_DATA: 'Warcraft Logs recorded no player data for this fight.',
  AI_NOT_CONFIGURED: 'AI analysis is not configured. Set OPENAI_API_KEY to enable the AI Coach.',
  AI_ERROR: 'The AI provider could not complete the analysis.',
  BAD_REQUEST: 'The request was malformed.',
  INTERNAL: 'Something went wrong while analysing this report.',
};

const STATUS: Record<NoxErrorCode, number> = {
  NOT_CONFIGURED: 503,
  INVALID_URL: 400,
  INVALID_REPORT_CODE: 400,
  REPORT_NOT_FOUND: 404,
  REPORT_PRIVATE: 403,
  AUTH_FAILED: 502,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  GRAPHQL_ERROR: 502,
  NO_FIGHTS: 404,
  FIGHT_NOT_FOUND: 404,
  NO_PLAYER_DATA: 404,
  AI_NOT_CONFIGURED: 503,
  AI_ERROR: 502,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

export class NoxError extends Error {
  readonly code: NoxErrorCode;
  readonly status: number;
  /** Extra context safe to show the user. */
  readonly detail: string | null;

  constructor(code: NoxErrorCode, detail?: string | null) {
    super(USER_MESSAGE[code]);
    this.name = 'NoxError';
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail ?? null;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, detail: this.detail } };
  }
}

export function isNoxError(value: unknown): value is NoxError {
  return value instanceof NoxError;
}

/** Map an unknown thrown value to a NoxError without leaking internals. */
export function toNoxError(err: unknown): NoxError {
  if (isNoxError(err)) return err;
  if (err instanceof Error && err.name === 'AbortError') {
    return new NoxError('UPSTREAM_UNAVAILABLE', 'The request timed out.');
  }
  return new NoxError('INTERNAL');
}
