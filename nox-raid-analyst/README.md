# NOX Raid Analyst

**FROM THE PULL TO THE PLAYER — Every pull has a story.**

NOX turns raw Warcraft Logs data into evidence-based raid coaching for guild leadership,
raid leaders, officers and individual players.

It is **not** a Warcraft Logs viewer and not a clone of one. Warcraft Logs answers *what the
numbers were*. NOX answers *what happened, why it happened, and what to do on the next pull* —
and shows the evidence behind every claim.

---

## The rule that shapes everything

**NOX never invents data.**

Every number, timestamp, ability name, death and recommendation is either read directly from
Warcraft Logs or computed deterministically from Warcraft Logs values. Where the dataset cannot
support a conclusion, NOX says so in those words:

> Insufficient evidence.

And for the single most commonly abused claim in raid analysis:

> Defensive usage could not be conclusively evaluated from the available dataset.

NOX can see that a defensive was *not used*. It cannot see whether it was *available*. So it
does not accuse anyone of wasting one.

Concretely, this is enforced in code, not in prose:

| Rule | How it is enforced |
|---|---|
| Findings need evidence | `EvidenceBuilder.finding()` returns `null` for an empty evidence array; AI findings with no evidence are dropped before render |
| A missing dataset is not a zero | Each dataset has a `coverage` flag; the UI shows `—`, and the AI payload carries an explicit caveat |
| No invented spec/role | Unrecognised specs resolve to `unknown`, never silently to DPS |
| No fake scores | There is no percentile, grade or rating anywhere in the codebase |
| AI does no arithmetic | The model receives an already-computed payload and is told to interpret only |
| Demo data is never disguised | Any payload with `source: 'demo'` renders a **DEMO DATA** badge |

---

## Architecture

Next.js 16 (App Router) + React 19 + TypeScript, strict mode.

```
src/
  app/
    page.tsx                  Workspace shell (client) — all views, no full reloads
    layout.tsx, globals.css   NOX design system
    api/
      status/                 Integration status (never returns secrets)
      report/                 URL/code -> report metadata + fight list
      fight/                  Full deterministic analysis for one pull
      compare/                Two attempts of the same encounter
      ai/                     Optional AI interpretation
  lib/
    warcraftlogs/
      oauth.ts                OAuthTokenService — client-credentials, cached, auto-refresh
      client.ts               WarcraftLogsClient — GraphQL, retry, error mapping
      queries.ts              Static GraphQL documents (variables only, no interpolation)
      reportService.ts        ReportService — metadata + roster
      fightService.ts         FightService — orchestrates one pull's retrieval
      eventService.ts         EventService — correct pagination, bounded
      normalize.ts            Raw JSON -> domain model (defensive readers)
      parseReport.ts          URL/code parsing
      errors.ts               Typed error taxonomy
    analysis/
      raidEngine.ts           RaidAnalysisEngine — summary, sources, timeline, findings
      playerEngine.ts         PlayerAnalysisEngine — per-player rows
      deathAnalyzer.ts        Deaths + pre-death event windows
      comparePulls.ts         Pull deltas + same-spec comparison
      evidence.ts             EvidenceBuilder — the provenance layer
      roles.ts                Spec -> role classification (game metadata)
    openai/
      aiService.ts            AIAnalysisService — server-side, validated, sanitised
      prompt.ts               System prompt + compact analysis payload
    cache/                    TTL cache + in-flight request deduplication
    demo/fixtures.ts          DEMO DATA, built through the real engine
  components/                 UI
tests/                        172 tests, offline
```

### Data flow

```
Paste URL
  -> parseReportInput()           robust code extraction
  -> OAuthTokenService            cached token, refreshed before expiry
  -> ReportService                report + fights + roster        [cached 10m]
  -> user picks a pull
  -> FightService                 7 tables in parallel            [cached 30m]
                                  + playerDetails (role/spec)
                                  + per-death DamageTaken windows (narrowed by targetID)
                                  + interrupt/dispel event streams
  -> normalize                    raw JSON -> typed domain model  (server-side only)
  -> RaidAnalysisEngine           deterministic metrics + findings
  -> EvidenceBuilder              every claim gets provenance
  -> browser                      compact normalized payload, never raw events
  -> [optional] AIAnalysisService interprets the computed payload
```

### Why the AI is a layer, not the product

The deterministic engine runs first and stands alone. If `OPENAI_API_KEY` is absent or the
provider is down, **every other feature still works**. The AI never computes a number; it
receives the finished analysis and is asked to interpret it.

---

## Setup

### 1. Requirements

- Node.js 20.9+ (developed on 22)
- A Warcraft Logs API v2 client

### 2. Create a Warcraft Logs client

1. Sign in at [warcraftlogs.com](https://www.warcraftlogs.com).
2. Go to **[warcraftlogs.com/api/clients/](https://www.warcraftlogs.com/api/clients/)**.
3. Create a client. Any name; the redirect URL is unused by the public-report flow.
4. Copy the **Client ID** and **Client Secret**.

These use the OAuth 2.0 **client credentials** flow, which reads **public reports**. They stay
server-side and are never sent to the browser.

### 3. Configure the environment

```bash
cp .env.example .env.local
```

```bash
WARCRAFTLOGS_CLIENT_ID=your_client_id
WARCRAFTLOGS_CLIENT_SECRET=your_client_secret

OPENAI_API_KEY=sk-...        # optional — enables the AI Coach
OPENAI_MODEL=gpt-4o-mini     # optional
NOX_DEV_MODE=false           # true adds a diagnostics panel to Settings
```

`.env.local` is gitignored. Never commit real credentials.

### 4. Run

```bash
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

### 5. Use it

1. Open the app.
2. Paste a **public** Warcraft Logs report URL, e.g.
   `https://www.warcraftlogs.com/reports/<code>` (fight anchors like `#fight=12` are honoured).
3. Pick a pull.
4. Work through Pull Analysis → Players → Deaths → Casts → Compare Pulls.
5. Optionally run the AI Coach, and open the evidence panel on any finding.

No credentials yet? Click **Explore with demo data** — clearly badged **DEMO DATA** throughout.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Testing

```bash
npm test
```

172 tests, all offline, covering:

- **Report parsing** — URLs, subdomains, fight anchors, bare codes, lookalike-host rejection
- **Normalization** — percentage scaling, attempt numbering, role/spec resolution, table shape variance
- **Metrics** — DPS/HPS, shares, active time, damage-source aggregation (values asserted exactly)
- **Deaths** — ordering, timestamp rebasing, window reconstruction, cross-player filtering, clustering
- **Evidence** — provenance stamping, unique ids, and the refusal to build an evidence-free finding
- **Comparison** — deltas, tolerance bands, and the duration/rate corrections described below
- **Transport** — OAuth caching, 401 refresh-and-retry, 500 backoff, 429/403 mapping, GraphQL errors
- **AI** — key never in the body, evidence-free findings dropped, markup sanitised, non-JSON rejected
- **Demo** — flagged as demo everywhere, built through the real engine

Mock Warcraft Logs payloads live in `tests/fixtures/wcl.ts` and are shaped like real API v2
responses. **Mock data never appears in the app as if it were live** — the demo dataset is a
separate, explicitly badged path.

### A note on two comparison corrections

Two naive comparisons produce false conclusions, so they are handled explicitly and tested:

- **Duration** carries a verdict only when both pulls ended the same way. A 5-minute kill is not
  "worse" than a 3-minute wipe.
- **Damage taken** is compared as a **rate**, not a cumulative total, because a longer pull
  accumulates more damage regardless of how well it was played.

---

## Security

- Secrets are read from the server environment only, and are never returned by any endpoint.
  `/api/status` reports **presence**, not values.
- GraphQL documents are frozen strings; all caller input travels as variables. There is no
  dynamic query construction anywhere.
- Logs pass through `redact()`, which strips bearer tokens, basic auth and `sk-` keys.
- AI output is schema-validated and sanitised (tags and control characters removed) before render.
  The app never uses `dangerouslySetInnerHTML`.
- Request bodies are size-capped and schema-validated; endpoints are rate-limited (40/min per IP).
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- `npm audit`: 0 vulnerabilities.

---

## Performance and API cost

Warcraft Logs bills by API points, so NOX is deliberately frugal:

- **Nothing is fetched twice.** TTL cache: token ~1h, report 10m, fight/event data 30m.
- **Concurrent identical requests are deduplicated** — a second caller awaits the first's promise
  rather than issuing its own request.
- **Report metadata and combat data are separate.** Loading a report does not fetch any pull.
- **Death windows are narrowed by `targetID`** and bounded to a 12-second window, rather than
  pulling a whole fight's damage stream.
- **Event pagination is followed correctly** via `nextPageTimestamp`, with a page ceiling. When
  the ceiling truncates a stream, the UI is told — a partial dataset is never shown as complete.
- **Normalization happens on the server.** The browser receives a compact analysis, never a
  combat log.
- Switching tabs, players or views never refetches.

---

## Known limitations

Stated plainly, because the product's value is not overclaiming.

1. **Public reports only.** Client-credentials OAuth cannot read private reports. The client is
   structured so a user-OAuth flow can be added, but that is not implemented.
2. **No encounter mechanic database.** NOX knows abilities by the names in the log. It does not
   know what a mechanic *is meant to do*, so it will not tell you "you failed the soak" — only
   that an ability hit certain players for certain amounts.
3. **Cooldown availability is not modelled.** Hence the explicit refusal to judge defensive usage.
4. **No theoretical-maximum cast analysis.** Computing "you could have cast X N more times"
   honestly requires downtime, phase timings, target availability, resource state and death
   timing. NOX reports recorded casts and says why it stops there.
5. **Spec detection depends on `playerDetails`.** If Warcraft Logs does not report a spec, the
   player is `unknown` and is excluded from role-aware comparison rather than being guessed.
6. **Percentile ranks are absent by design.** They are a Warcraft Logs product feature and are
   not recomputed or approximated here.
7. **Event-level windows cover the first 10 deaths** per pull, to bound API spend. The UI says so.
8. **Cache is in-process.** Restarting the server clears it; a multi-instance deployment would
   want a shared cache (Redis) instead.
9. **The AI layer is only as good as its evidence.** It is constrained hard and its evidence-free
   findings are discarded, but it is still a language model — the evidence panel exists so you
   can check it.

---

## Deployment

Any Node host that runs Next.js (Vercel, Railway, Fly, a container).

```bash
npm run build
npm start
```

Set `WARCRAFTLOGS_CLIENT_ID`, `WARCRAFTLOGS_CLIENT_SECRET` and optionally `OPENAI_API_KEY` as
environment variables in the host's configuration — not in a committed file.

For multi-instance deployments, replace the in-process cache in `src/lib/cache/` with a shared
store so API points are not spent once per instance.

---

## Licence

Not affiliated with Blizzard Entertainment or Warcraft Logs. World of Warcraft is a trademark of
Blizzard Entertainment, Inc.
