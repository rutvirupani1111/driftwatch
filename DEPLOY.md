# Deploying Driftwatch

Driftwatch needs no servers: GitHub Actions runs the monitor and GitHub Pages hosts the site.
This is the checklist for publishing `rutvirupani1111/driftwatch` (and the same steps apply to any fork).

## 1. Push the repository

```bash
git init -b main
git add .
git commit -m "Driftwatch 0.1.0"
gh repo create rutvirupani1111/driftwatch --public --source . --push
```

`data/`, `public/badges/`, `public/feeds/` and `public/feed.xml` contain real observations seeded on
2026-10-23. Commit them: the site shows them until the first scheduled run adds more.

## 2. api-drift needs no setup

api-drift's browser-safe core is vendored into `src/vendor/api-drift` (each file names its upstream
commit) and `api-drift/core` resolves to it in Vite, Vitest and TypeScript (see `build/api-drift.ts`).
Every build, local, in Actions or on Vercel, works without a sibling checkout. Every call goes
through `src/lib/drift.ts`, so switching to a published package later touches only the resolution.

## 3. Turn on GitHub Pages

Settings → Pages → Build and deployment → **Source: Deploy from a branch**, branch `gh-pages`, folder `/`.
The Monitor workflow commits the built site to `gh-pages` on every run; GitHub's own Pages build
then publishes it. (`actions/deploy-pages` is not used: the `github-pages` environment only accepts
deployments from `gh-pages`.)

The workflow reads the Pages URL and base path from `actions/configure-pages`, so the site is built
for `/driftwatch/` (or whatever the repository is called, or `/` for a custom domain) and feed / badge
links use the real public URL (`SITE_URL`).

## 4. Check Actions permissions

- Settings → Actions → General → Actions permissions: allow actions (they are all official
  `actions/*`).
- The monitor workflow asks for `contents: write` (to commit data), `pages: write` and `id-token: write`
  (to deploy). If the organisation forces read-only tokens, allow write for this repository.
- If `main` is protected against pushes, either allow `github-actions[bot]` to bypass, or point the
  commit step at an unprotected `data` branch.

## 5. First run

Actions → **Monitor** → Run workflow. It checks every API, commits `data/` if something changed,
builds the site and deploys it. After that it runs every 3 hours at :17 UTC. Pushes to `main` rebuild
and redeploy without calling the APIs.

Optional input `rebaseline` forgets learned contracts (`all` or comma-separated ids).

## 6. Optional secrets

| Secret | Effect |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Breaking and risky changes are posted to a Discord channel. |
| `SLACK_WEBHOOK_URL` | Same for a Slack incoming webhook. |
| any `NAME` | Reference as `${NAME}` in `driftwatch.config.json` and add `NAME: ${{ secrets.NAME }}` to the monitor step's `env`. |

`GITHUB_TOKEN` is passed automatically and gives the GitHub monitor a higher rate limit.

## 7. Make it a template

Settings → General → **Template repository**. The "Use this template" button on the
Watch-your-own page links to `https://github.com/rutvirupani1111/driftwatch/generate`.

## Verify

- `https://rutvirupani1111.github.io/driftwatch/` shows the forecast.
- `…/feed.xml` is valid Atom; `…/badges/github-repo.svg` renders.
- Deep links (`…/api/github-repo`) load: Pages serves `404.html` (a copy of `index.html`) and the
  client router takes over.
- The run summary (Actions → Monitor → a run) shows the forecast table.

## Good to know

- GitHub disables scheduled workflows in public repositories after 60 days without activity. The
  monitor commits a heartbeat at least weekly, which keeps the schedule alive.
- Scheduled runs can start late or be skipped when GitHub is busy; the :17 offset helps.
- The Actions cache keeps per-run state between commits; if it is evicted, the next run continues
  from the last committed data.
