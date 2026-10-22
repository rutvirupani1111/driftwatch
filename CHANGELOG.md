# Changelog

All notable changes to Driftwatch. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-10-23

First release.

### Monitor
- `npm run monitor` checks every API in `driftwatch.config.json` once: polite User-Agent, 15 s timeout,
  status, latency and size, `${SECRET}` substitution from the environment (headers whose secret is
  missing are skipped, URLs and bodies that need one fail as a config error).
- Contracts are learned with [api-drift](https://github.com/rutvirupani1111/api-drift): every response is
  merged into a baseline with presence counts; drift is reported only when the learned contract's
  fingerprint moves, each surprise once, with breaking / risky / info severities.
- Payload normalisation: `ignore` paths and dynamic-key maps (`<version>`, `<date>`, `<id>`, `<hash>`).
- Writes `data/apis/<id>/latest.json`, `history.jsonl` (120 days), `changes.json`, `data/index.json`,
  `data/changes.json`, Atom feeds (`public/feed.xml`, `public/feeds/<id>.xml`) and shields-style badges
  (`public/badges/<id>.svg`).
- Weather model: storm, fog, partly cloudy, clear skies; uptime and p50 / p95 latency over 1, 7 and 30 days;
  a 30-day climate row per API.
- Optional Discord / Slack webhooks for breaking and risky changes.
- GitHub step summary, a `changed` output, and `--restore` to merge state from the Actions cache.
- 25 public, keyless APIs monitored out of the box, each verified by hand on 2026-10-23.

### Site
- Forecast (headline, condition filters, category chips, search, station cards with latency sparklines,
  climate heatmap, recent drift), API detail (vital signs, latency chart, collapsible contract tree,
  TypeScript / Zod, change timeline with before → after, badge and feed snippets), Changes (filterable
  changelog), Playground (JSON vs JSON drift report, HAR → contracts / TypeScript / Zod, in the browser),
  Watch your own (template guide and config builder), About (pipeline diagram, privacy, credits).
- Night sky (default) and daylight themes, hand-drawn animated SVG weather glyphs, self-hosted
  Instrument Serif, Inter and JetBrains Mono, reduced-motion support, mobile layouts down to 320 px.

### Automation
- `.github/workflows/monitor.yml`: every 3 hours at :17, on demand and on push; commits data only when
  something changed (or weekly), keeps the rest in the Actions cache, deploys to GitHub Pages.
- `.github/workflows/ci.yml`: typecheck, unit tests, production build and a Playwright smoke test on PRs.

### Notes
- REST Countries v3.1 started requiring an API key during the build (its legacy API was deprecated), and
  Nager.Date has no holiday data for India (HTTP 204), so neither is in the default list as specified.
