import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheClear } from '@/lib/cache';
import { NoxError } from '@/lib/warcraftlogs/errors';
import { graphql, mapGraphQLErrors } from '@/lib/warcraftlogs/client';
import { getAccessToken, isWarcraftLogsConfigured } from '@/lib/warcraftlogs/oauth';

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch stub that answers the token endpoint and delegates GraphQL calls. */
function stubFetch(graphqlHandler: (body: unknown) => Response, tokenStatus = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      if (tokenStatus !== 200) return new Response('nope', { status: tokenStatus });
      return jsonResponse({ access_token: 'test-token-abc', expires_in: 3600 });
    }
    return graphqlHandler(init?.body ? JSON.parse(String(init.body)) : null);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  cacheClear();
  process.env.WARCRAFTLOGS_CLIENT_ID = 'test-id';
  process.env.WARCRAFTLOGS_CLIENT_SECRET = 'test-secret';
});

describe('configuration', () => {
  it('reports configured when both variables are present', () => {
    expect(isWarcraftLogsConfigured()).toBe(true);
  });

  it('reports not configured when a variable is missing', () => {
    delete process.env.WARCRAFTLOGS_CLIENT_SECRET;
    expect(isWarcraftLogsConfigured()).toBe(false);
  });

  it('throws NOT_CONFIGURED rather than calling the API', async () => {
    delete process.env.WARCRAFTLOGS_CLIENT_ID;
    const fetchImpl = stubFetch(() => jsonResponse({ data: {} }));
    await expect(getAccessToken(fetchImpl)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('OAuth token service', () => {
  it('obtains a token with client credentials', async () => {
    const fetchImpl = stubFetch(() => jsonResponse({ data: {} }));
    await expect(getAccessToken(fetchImpl)).resolves.toBe('test-token-abc');

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(init.body)).toContain('grant_type=client_credentials');
    // Credentials travel as HTTP Basic, never in the body or the query string.
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(String(init.body)).not.toContain('test-secret');
  });

  it('caches the token instead of re-authenticating', async () => {
    const fetchImpl = stubFetch(() => jsonResponse({ data: {} }));
    await getAccessToken(fetchImpl);
    await getAccessToken(fetchImpl);
    const tokenCalls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url) === TOKEN_URL,
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('maps rejected credentials to AUTH_FAILED', async () => {
    const fetchImpl = stubFetch(() => jsonResponse({ data: {} }), 401);
    await expect(getAccessToken(fetchImpl)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('maps an unreachable token endpoint to UPSTREAM_UNAVAILABLE', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(getAccessToken(fetchImpl)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('rejects a token response with no access_token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === TOKEN_URL ? jsonResponse({ token_type: 'Bearer' }) : jsonResponse({}),
    ) as unknown as typeof fetch;
    await expect(getAccessToken(fetchImpl)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});

describe('graphql transport', () => {
  it('sends the query and variables and returns data', async () => {
    const fetchImpl = stubFetch(() => jsonResponse({ data: { ok: true } }));
    const data = await graphql<{ ok: boolean }>('query Q($c: String!) { x }', { c: 'CODE' }, {
      label: 'test',
      fetchImpl,
    });
    expect(data).toEqual({ ok: true });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    const body = JSON.parse(String(call[1].body));
    // The code travels as a variable; it is never interpolated into the query.
    expect(body.variables).toEqual({ c: 'CODE' });
    expect(body.query).not.toContain('CODE');
    expect(call[1].headers.Authorization).toBe('Bearer test-token-abc');
  });

  it('refreshes the token once on a 401 and retries', async () => {
    let graphqlCalls = 0;
    const fetchImpl = stubFetch(() => {
      graphqlCalls += 1;
      return graphqlCalls === 1 ? new Response('unauthorized', { status: 401 }) : jsonResponse({ data: { ok: 1 } });
    });
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).resolves.toEqual({ ok: 1 });
    expect(graphqlCalls).toBe(2);
  });

  it('retries a 500 and succeeds', async () => {
    let calls = 0;
    const fetchImpl = stubFetch(() => {
      calls += 1;
      return calls < 3 ? new Response('boom', { status: 500 }) : jsonResponse({ data: { ok: 1 } });
    });
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(3);
  });

  it('gives up on persistent 500s with UPSTREAM_UNAVAILABLE', async () => {
    const fetchImpl = stubFetch(() => new Response('boom', { status: 500 }));
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('maps a 429 to RATE_LIMITED without retrying', async () => {
    let calls = 0;
    const fetchImpl = stubFetch(() => {
      calls += 1;
      return new Response('slow down', { status: 429 });
    });
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(calls).toBe(1);
  });

  it('maps a 403 to REPORT_PRIVATE', async () => {
    const fetchImpl = stubFetch(() => new Response('forbidden', { status: 403 }));
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).rejects.toMatchObject({
      code: 'REPORT_PRIVATE',
    });
  });

  it('surfaces GraphQL errors from a 200 response', async () => {
    const fetchImpl = stubFetch(() =>
      jsonResponse({ errors: [{ message: 'This report does not exist.' }] }),
    );
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    });
  });

  it('rejects an unparseable body', async () => {
    const fetchImpl = stubFetch(() => new Response('<html>nope</html>', { status: 200 }));
    await expect(graphql('query {}', {}, { label: 'test', fetchImpl })).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
    });
  });
});

describe('mapGraphQLErrors', () => {
  it('recognises permission failures', () => {
    expect(mapGraphQLErrors([{ message: 'You do not have permission to view this report' }]).code).toBe(
      'REPORT_PRIVATE',
    );
  });
  it('recognises missing reports', () => {
    expect(mapGraphQLErrors([{ message: 'Report not found' }]).code).toBe('REPORT_NOT_FOUND');
  });
  it('recognises rate limiting', () => {
    expect(mapGraphQLErrors([{ message: 'You have exceeded the rate limit' }]).code).toBe('RATE_LIMITED');
  });
  it('falls back to GRAPHQL_ERROR', () => {
    const err = mapGraphQLErrors([{ message: 'Cannot query field "wat"' }]);
    expect(err.code).toBe('GRAPHQL_ERROR');
    expect(err.detail).toContain('Cannot query field');
  });
  it('truncates anything token-shaped out of upstream messages', () => {
    const long = 'x'.repeat(60);
    const err = mapGraphQLErrors([{ message: `bad token ${long}` }]);
    expect(err.detail).not.toContain(long);
  });
  it('produces a NoxError with an HTTP status', () => {
    expect(mapGraphQLErrors([{ message: 'Report not found' }])).toBeInstanceOf(NoxError);
    expect(mapGraphQLErrors([{ message: 'Report not found' }]).status).toBe(404);
  });
});
