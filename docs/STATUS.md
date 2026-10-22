# Driftwatch build status

Last updated: 2026-10-23 ~04:10 IST (final for this shift: feature complete, verified)

## Done
- **Monitor** (`monitor/*.ts`, `npm run monitor`): config validation + `${SECRET}` substitution, probe
  (15 s timeout, polite UA), learned baseline with api-drift (merge; diff only when the learned
  fingerprint moves), history.jsonl (120-day compaction), changes.json, index.json, global changes.json,
  Atom feeds (global + per API), SVG badges, Discord/Slack alerts, GitHub step summary + `changed`
  output, Actions-cache restore (`--restore`), `--only`, `--rebaseline`.
- **api-drift**: `src/lib/drift.ts` imports the real `api-drift/core` (source of ../api-drift via
  Vite/Vitest alias + tsconfig `paths`, see `build/api-drift.ts`). The temporary engine was removed.
  Stored shapes carry `engine: api-drift/shape@1` (auto re-baseline on mismatch).
- **Config**: 25 public keyless APIs, each verified with curl on 2026-10-23 (`driftwatch.config.json`,
  JSON schema in `driftwatch.schema.json`).
- **Seed data**: 5 live monitor runs (03:15, 03:30, 03:39, 03:45, 03:52 IST); 25/25 OK. One real
  change event: Wikipedia random summary lost `$.coordinates`.
- **Site**: Forecast, API detail, Changes, Playground (JSON vs JSON + HAR → contract/TS/Zod, example HAR
  from real responses), Watch your own (template guide + config builder), About (diagram, privacy,
  credits), 404. Night/day themes, animated SVG glyphs, reduced motion, lazy routes, vendor chunks.
- **Automation**: `.github/workflows/monitor.yml` (cron `17 */3 * * *`, dispatch, push; cache-backed
  state, commit only on change + weekly heartbeat, Pages deploy), `.github/workflows/ci.yml`
  (typecheck, tests, build, Playwright smoke).
- **Docs**: README (screenshots), docs/ARCHITECTURE.md, DEPLOY.md, CHANGELOG.md, LICENSE (MIT), template.md.
- **Verified**: `npm run typecheck`, `npm test` (67 passing), `npm run build` (base `/driftwatch/`),
  `npm run e2e` (15 passing, incl. no horizontal overflow at 375 px on every page and every API page).

## Not done / not verified
- Workflows have not run on GitHub yet (nothing pushed; builders do not push).
- Discord/Slack alert delivery tested only against a fake fetch, not real webhooks.
- package.json still resolves api-drift from the sibling folder; CI clones it as a fallback.

## Next steps (lead)
1. Push the repo; Settings → Pages → Source: GitHub Actions; run the Monitor workflow once.
2. Optional: `npm install github:rutvirupani1111/api-drift` and commit (see DEPLOY.md §2).
3. Settings → General → Template repository.
4. Optional secrets: DISCORD_WEBHOOK_URL / SLACK_WEBHOOK_URL.

## Known issues / notes
- REST Countries v3.1 now requires an API key (legacy API deprecated), so it is not monitored.
- Nager.Date has no data for India (HTTP 204), so the UK is monitored instead.
- The one recorded change event predates the api-drift switch, so its message text uses the old engine's
  wording ("$.coordinates was removed").
