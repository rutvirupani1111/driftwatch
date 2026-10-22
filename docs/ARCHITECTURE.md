# Architecture

Driftwatch is three things in one repository: a **monitor** (a Node script run by GitHub Actions),
the **data** it keeps (plain files committed to git), and a **static site** that reads that data.
There is no server and no database.

```
                    every 3 h (cron 17 */3 * * *)
                                │
┌───────────────────────────────▼────────────────────────────────┐
│ monitor/cli.ts                                                  │
│  config.ts ── resolveRequest (${SECRET} → env, in memory only)  │
│  fetcher.ts ─ probe: fetch, 15 s timeout, latency, size, JSON   │
│  pipeline.ts                                                    │
│    normalize (ignore paths, <dynamic> keys)                     │
│    api-drift via src/lib/drift.ts: infer → merge → fingerprint  │
│      fingerprint moved? → diff(baseline, observed) → event      │
│    history.ts (120 d) · stats.ts (uptime, p50/p95, climate)     │
│    weather.ts (storm / fog / partly cloudy / clear)             │
│  feed.ts (Atom) · badge.ts (SVG) · alerts.ts (Discord/Slack)    │
└───────────────┬───────────────────────────────┬────────────────┘
                │ writes                        │ $GITHUB_OUTPUT changed=…
        data/  public/feeds,badges              ▼
                │                    commit only if something moved
                ▼                               │
        vite build ──► dist/ (+ data/, 404.html) ──► GitHub Pages
```

## Directory map

| Path | What |
| --- | --- |
| `driftwatch.config.json` | The monitors (validated by `src/lib/config.ts`, schema in `driftwatch.schema.json`). |
| `monitor/` | Node-only code: CLI, fetching, the pipeline, files, feeds, badges, alerts. |
| `src/lib/` | Code shared by the monitor and the site: the api-drift adapter, normalisation, weather model, types, config validation, formatting. Everything here is browser-safe. |
| `src/components`, `src/pages` | The React site. |
| `data/` | Monitor output (committed). |
| `public/` | Static files: favicon, example HAR, plus generated `feed.xml`, `feeds/`, `badges/`. |
| `build/api-drift.ts` | How Vite / Vitest find api-drift (sibling source or node_modules) and its `__VERSION__`. |
| `tests/` | Vitest unit and pipeline tests (offline, fake fetch). |
| `e2e/` | Playwright smoke test and README screenshots (built site on port 5185). |

## The api-drift boundary

`src/lib/drift.ts` is the only file that imports `api-drift/core`. It exposes Driftwatch's own
vocabulary:

- `infer(value)`, `merge(a, b)`, `diff(baseline, observed)` (engine shapes; `diff` attaches the
  contract fragments found at each change's path),
- `toContract(shape)`: a **structure-only** `ContractNode` tree used for display, fingerprints and
  storage next to the opaque engine shape,
- `fingerprint(contract)`, `countFields`, `typeText`, `nodeAt`,
- `toTypeScript` / `toZod` (api-drift's typegen; a structural fallback for bare contracts),
- `endpointKey`, `importHar` (Playground),
- `restoreShape(stored)`: validates a stored shape (`normalizeShape`) or returns null.

Stored shapes are stamped `engine: "api-drift/shape@1"`. A different engine id, or a shape that no
longer validates, makes the monitor **re-baseline** that API (no spurious alerts) and say so in the
run log.

## The learning model

Comparing each response with the previous one is noisy: optional fields come and go and `12` is still a
number. So each API has a **learned baseline**: the `merge` of every successful response, with presence
counts (a field present in all samples is required, in some samples optional).

For each new response:

1. `current = infer(normalize(json))`
2. `merged = merge(baseline, current)`; compute `fingerprint(toContract(merged))`
3. Same fingerprint → nothing new; store `merged` (counts grow), no event.
4. Different fingerprint → `diff(baseline, current)` lists what the baseline did not allow
   (api-drift semantics) → one **change event** with every change; store `merged`.

Consequences: a surprise is reported once (afterwards the baseline allows it), optional fields absent
from one response are not news, and a field that was always there and vanished is `removed` (breaking).
`--rebaseline <ids|all>` forgets the learned contract.

Normalisation before inference (`src/lib/normalize.ts`):

- `ignore` paths (`$.meta.debug`, `$.items[].tracking`, `$.*.internal`) are pruned.
- Objects with ≥ 4 keys of which ≥ 90 % look like data (`<date>`, `<version>`, `<id>`, `<uuid>`,
  `<hash>`) collapse into one placeholder key holding the richest value. api-drift additionally
  merges id-like keys into `<key>` (its `additional` shape).

Enum capture is off: in a monitor, low-cardinality strings are values (versions, names), and treating
them as enums would alert on every release.

## Severities and weather

Severities are api-drift's: **breaking** (`removed`, `type-changed`), **risky** (`nullable`, `optional`,
`format-changed`, `number-widened` / `narrowed`, `enum-added`, `emptied`), **info** (`added`,
`added-optional`, `type-learned`, `format-gained`, ...). Number changes need 10 baseline samples.

Weather per API (`src/lib/weather.ts`), computed by the monitor at run time:

| Condition | Rule |
| --- | --- |
| fog | the latest check failed (network, timeout, non-2xx, empty or non-JSON body, missing secret) |
| storm | a breaking change in the last 7 days |
| partly cloudy | any other change in the last 7 days |
| sunny | none of the above |

Fog wins over storm: an unreachable API is the most urgent thing to know. Uptime and p50 / p95 latency
are computed from history over 1, 7 and 30 days (latency over successful checks only, nearest-rank).

## Data files

All times are ISO 8601 UTC.

### `data/apis/<id>/history.jsonl`

One line per check, compact keys, 120 days kept (`compactHistory` also sorts and de-duplicates):

```json
{"t":"2026-10-22T21:45:34.000Z","ok":1,"s":200,"ms":556,"b":5952,"fp":"9254f984ac379e43"}
{"t":"2026-10-23T00:17:02.000Z","ok":0,"s":503,"ms":121,"b":96,"e":"http_503"}
```

`ok` success flag · `s` HTTP status (0 = no response) · `ms` latency (full body) · `b` bytes · `fp`
contract fingerprint · `e` error code (`timeout`, `network`, `http_NNN`, `invalid_json`, `not_json`,
`empty_body`, `too_large`, `config`) · `c` number of changes found by this check.

### `data/apis/<id>/latest.json`

The API's current state: config echo (URL **as written**, placeholders unresolved), last check
(status, latency, size, content type, error), `engine`, `fingerprint`, `contract` (ContractNode),
`shape` (opaque api-drift shape with counts = the learned baseline), `samples`, `firstSeenAt`,
`contractSince`, `lastChange`, `weather`, `stats` (`d1`, `d7`, `d30`: checks, ok, uptime, p50, p95).

### `data/apis/<id>/changes.json`

Array of change events, oldest first (last 500):

```json
{
  "id": "wikipedia-random@2026-10-22T22:09:00.000Z",
  "apiId": "wikipedia-random", "apiName": "Wikipedia REST: random summary",
  "at": "2026-10-22T22:09:00.000Z", "severity": "breaking",
  "summary": "$.coordinates: field is missing (…) (1 breaking)",
  "fingerprintBefore": "…", "fingerprintAfter": "…",
  "changes": [{ "path": "$.coordinates", "kind": "removed", "severity": "breaking",
                "message": "…", "before": "object", "after": "missing",
                "beforeNode": { "type": "object", "properties": { … } } }]
}
```

### `data/index.json`

Everything the Forecast needs in one request: `generatedAt`, `engine`, `site`, `schedule`, `counts`
per condition, `categories`, one `ApiSummary` per API (condition, reason, uptime, p50/p95, 24-point
latency sparkline, last change), `climate` (30 characters per API, oldest first:
`.` no data, `c` clear, `i` info, `r` risky, `f` failed checks, `b` breaking) and the 12 most recent
events.

### `data/changes.json`

The global changelog (newest first, last 400 events) for the Changes page.

### Feeds and badges

`public/feed.xml` (last 50 events) and `public/feeds/<id>.xml` (last 30) are Atom 1.0 with stable
entry ids. `public/badges/<id>.svg` is a flat shields-style badge: `schema | stable`,
`changed 2d ago` (blue for info, amber for risky), `breaking 1h ago`, `unreachable`, `learning`.

## Commit policy and the Actions cache

Committing every run would flood the history with latency noise. The monitor sets `changed=true` when
an API is new, its HTTP status or success flipped, or its contract fingerprint moved. The workflow:

1. restores the newest `driftwatch-state-*` cache into `.driftwatch-cache/`,
2. `npm run monitor -- --restore .driftwatch-cache/data` merges it if newer than the committed data
   (histories and events are unioned, the newer `latest.json` wins),
3. saves `data/` as a new cache entry,
4. commits `data/` + feeds + badges only when `changed=true` or the last data commit is ≥ 6 days old.

So the full history survives between commits, and git only records meaningful moments.

## The site

- Vite 7, React 19, React Router 7 (`BrowserRouter` with the Pages base path), Tailwind 4, motion 12.
- `vite.config.ts` serves `./data` in dev and copies it into `dist/data` at build time, and writes
  `dist/404.html` (a copy of `index.html`) so deep links work on Pages.
- Data is fetched at runtime from the site's own origin (`src/lib/data.ts`, cached per path). HTML
  responses (Pages 404s, SPA fallbacks) count as "not found".
- The Forecast ships in the first chunk; API detail, Changes, Playground, Watch-your-own and About are
  lazy, and api-drift loads only with them. React and motion live in long-cached vendor chunks.

### Design system

- **Metaphor**: each API is a weather station. Conditions are words first (Storm, Fog, Partly cloudy,
  Clear skies), colour second, glyph third, so nothing depends on colour alone.
- **Themes**: night sky by default (`data-theme="night"`), daylight on request, persisted in
  `localStorage` and applied before first paint. All colours are CSS variables in `app.css`, exposed to
  Tailwind through `@theme inline`; glyph paints have their own variables so the SVGs follow the theme.
- **Type**: Instrument Serif for headlines and condition names, Inter for UI, JetBrains Mono for data,
  all self-hosted through @fontsource.
- **Glyphs** (`src/components/Glyph.tsx`): hand-drawn SVG sun, partly-cloudy, storm and fog with
  CSS-only motion (rotating rays, breathing halo, drifting cloud, flickering bolt, falling rain, sliding
  fog). `prefers-reduced-motion` stops all of it; MotionConfig follows the same preference.
- **Accessibility**: landmarks and a skip link, visible focus rings, `aria-pressed` filters, disclosure
  buttons with `aria-expanded`, keyboard-navigable tabs, tables with headers for the climate heatmap and
  the latency chart summarised in text.

## Testing

- `npm test` (Vitest, 67 tests, offline): the api-drift adapter (contract conversion, diff semantics,
  typegen, HAR import, endpoint keys), normalisation, weather classification, history compaction and
  stats, feeds and badges, config validation and secret substitution, probing (timeouts, non-JSON,
  network errors), and the whole pipeline end to end with a fake fetch over a temp directory
  (baseline → quiet run → breaking change → outage → recovery, alerts, cache restore, re-baselining, and
  a check that no secret ever reaches a written file).
- `npm run e2e` (Playwright, built site on :5185): every page, filters, theme persistence, deep links
  and the 404 fallback, feeds/badges/data, Playground (JSON diff + HAR), config builder, and no
  horizontal overflow at 375 px.
