# Driftwatch: the weather report for the APIs the internet runs on

Zero-infrastructure API contract monitoring. GitHub Actions calls a list of public
JSON APIs on a schedule, infers each response's shape with **api-drift**, records
history in the repo itself (git-scraping), and publishes a static dashboard to
GitHub Pages: what changed, when, and whether it would break you. Anyone can fork
it ("Use this template") to watch their own third-party APIs for free, with
secrets kept in GitHub Secrets and alerts to Slack/Discord webhooks.

## Dependency on api-drift

`../api-drift` (sibling folder) is being built at the same time by another builder.
Locally, import it from source: Vite alias `api-drift/core` → `../api-drift/src/core.ts`
(or whatever its core entry becomes; read its src and docs/STATUS.md) and for the
Node monitor script import `../api-drift/src/index.ts` through tsx. Wrap every
call you use in `src/lib/drift.ts` so swapping to the published package later is
a one-file change. For CI, the lead will switch the dependency to the GitHub repo
(`github:rutvirupani1111/api-drift`) when both are pushed; document that in
DEPLOY.md. Never edit ../api-drift.

## Monitor (Node 20+, TypeScript via tsx)

- `driftwatch.config.json`: list of monitors `{ id, name, category, url, method?, headers?, body?, docs, logo? }`.
  Headers may reference `${SECRET_NAME}` env vars. Start with 20-25 real public
  no-key JSON APIs, each verified to work with curl from this machine, for example:
  GitHub repos API, npm registry `react/latest`, PyPI JSON, crates.io (needs a
  User-Agent), Hacker News item, Wikipedia REST summary, Open-Meteo forecast,
  REST Countries, Frankfurter FX, Open Library work, PokeAPI, CoinGecko simple
  price, JSONPlaceholder, Dog CEO, deps.dev, OSV query (POST), Docker Hub repo,
  Nager.Date holidays (IN), GitLab project, Stack Exchange info, Homebrew formula,
  jsDelivr package stats, Hugging Face model, Open Food Facts product.
- `npm run monitor`: for each monitor, fetch with a polite User-Agent
  (`Driftwatch (+https://github.com/rutvirupani1111/driftwatch)`), timeout 15 s,
  record status, latency, size; infer the shape; compare with the stored baseline;
  write `data/apis/<id>/latest.json`, append a compact line to
  `data/apis/<id>/history.jsonl` (keep 120 days), append detected changes with
  before/after shape fragments to `data/apis/<id>/changes.json`, and update
  `data/index.json` (summary for the home page) plus `public/feed.xml` (Atom,
  global and per API) and `public/badges/<id>.svg` (shields-style "schema: stable
  / changed 2d ago / breaking 1h ago").
- Weather model per API: sunny (stable 7 days), partly cloudy (additive changes),
  storm (breaking change in 7 days), fog (errors/timeouts/5xx), plus uptime % and
  p50/p95 latency over 7 and 30 days.
- Optional alerts: if `DISCORD_WEBHOOK_URL` or `SLACK_WEBHOOK_URL` is set, post
  breaking and risky changes.
- Fully testable offline: inject a fake fetch; vitest covers the monitor pipeline,
  weather classification, feed and badge generation, history compaction.

## Site (Vite + React + TypeScript + Tailwind v4 + motion), deployed on GitHub Pages

Design: a genuine "weather report" metaphor done with taste, not kitsch. Dark
"night sky" theme by default with a light "daylight" theme. Custom SVG weather
glyphs (sun, cloud, storm, fog) that animate subtly. Typeface pairing such as
"Instrument Serif" for headings and "Inter"/"JetBrains Mono" for data,
self-hosted via @fontsource. Mobile-first, flawless at 375px.

Routes (hash or BrowserRouter with a 404.html fallback for Pages; `base` set for
`/driftwatch/`):
- `/` Forecast: headline ("3 storms, 18 clear skies today"), grid of API
  weather cards (name, category, glyph, last change, uptime, latency sparkline),
  filters by category and condition, a 30-day "climate" heatmap of changes across
  all APIs.
- `/api/:id`: current contract as a collapsible tree (types, formats, optional
  markers), change timeline with before/after diffs and severity chips, latency
  chart, uptime, badge embed snippets (Markdown/HTML), feed link, docs link.
- `/changes`: global changelog across all APIs, filterable by severity.
- `/playground`: paste two JSON payloads to see a live drift report, or drop a
  HAR file to get the inferred contract and generated TypeScript/Zod types, all
  in the browser with api-drift core. Ship a few one-click examples.
- `/watch-your-own`: the template guide: fork, edit config, add secrets, enable
  Pages and Actions, optional webhooks; with a config builder form that outputs
  `driftwatch.config.json`.
- `/about`: how it works (diagram), privacy (only shapes are stored, never
  values), credits to api-drift.

Data loading: the site fetches `data/index.json` and per-API files at runtime
from its own origin (copied into the Pages artifact at build time).

## Automation

- `.github/workflows/monitor.yml`: cron every 3 hours (off the hour, e.g.
  `17 */3 * * *`) plus manual dispatch; runs the monitor, commits data only when
  something changed (fingerprint/status) with a bot identity, then builds and
  deploys Pages (actions/deploy-pages).
- `.github/workflows/ci.yml`: typecheck, tests, build on pull requests.
- Template-ready: `template.md` explains what to change after forking.

## Quality

vitest unit tests, a Playwright smoke test of the built site (preview on port
5185), README with screenshots (taken by Playwright), docs/ARCHITECTURE.md,
DEPLOY.md, CHANGELOG.md, LICENSE (MIT, Rutvi Rupani). Seed `data/` by running the
real monitor once locally against the live APIs so the site has real content.
