# Using Driftwatch as a template

You forked Driftwatch (or clicked **Use this template**). Here is everything to change so it watches
**your** APIs. Ten minutes, no servers.

## 1. Point it at your APIs

Edit `driftwatch.config.json` (the dashboard's *Watch your own* page has a form that writes it for you):

```jsonc
{
  "$schema": "./driftwatch.schema.json",
  "site": {
    "title": "Acme API forecast",
    "url": "https://YOUR-USER.github.io/YOUR-REPO/",   // used in feeds, badges and alerts
    "repo": "YOUR-USER/YOUR-REPO"
  },
  "schedule": "17 */3 * * *",                          // keep in sync with monitor.yml (display only)
  "monitors": [
    {
      "id": "payments-charge",                          // slug: files, URLs, badges
      "name": "Payments: charge",
      "category": "Vendors",
      "url": "https://api.vendor.example/v1/charges/ch_test_123",
      "headers": { "Authorization": "Bearer ${VENDOR_API_KEY}" },
      "docs": "https://docs.vendor.example/charges",
      "ignore": ["$.metadata", "$.items[].debug"]       // optional: volatile sub-trees
    },
    {
      "id": "search",
      "name": "Search API",
      "category": "Vendors",
      "url": "https://api.vendor.example/v1/search",
      "method": "POST",
      "body": { "query": "status:active", "limit": 5 },
      "docs": "https://docs.vendor.example/search"
    }
  ]
}
```

Rules worth knowing:

- Each monitor needs `id`, `name`, `category`, `url`, `docs`. `method`, `headers`, `body`, `ignore`,
  `description`, `logo` (image URL or 1-3 letter monogram) and `timeoutMs` are optional.
- `${NAME}` placeholders are filled from environment variables at request time and never written to
  disk. A header whose secret is not set is skipped; a URL or body that needs a missing secret fails
  that check as a config error.
- Objects keyed by data (dates, versions, ids, hashes) are collapsed automatically, so you rarely need
  `ignore`.
- Check the file locally: `npm run monitor -- --only payments-charge`.

## 2. Clear the sample data

Delete the observations of the original 25 APIs:

```bash
rm -rf data public/badges public/feeds public/feed.xml
```

## 3. Add secrets

Settings → Secrets and variables → Actions → New repository secret, then expose each one to the monitor
step in `.github/workflows/monitor.yml`:

```yaml
      - name: Run the monitor
        env:
          VENDOR_API_KEY: ${{ secrets.VENDOR_API_KEY }}
```

Optional alerting secrets: `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL` (breaking and risky changes only).

## 4. Turn things on

1. Settings → Pages → Source: **GitHub Actions**.
2. Actions tab → enable workflows (forks start with them disabled).
3. Actions → **Monitor** → Run workflow.

The site is built for your repository name automatically (`BASE_PATH` comes from the Pages config),
so nothing else needs renaming.

## 5. Optional tweaks

| What | Where |
| --- | --- |
| Check frequency | `cron` in `.github/workflows/monitor.yml` (and `schedule` in the config, for the "next run" hint) |
| Request timeout, concurrency, User-Agent | `timeoutMs`, `concurrency`, `userAgent` in the config |
| History retention (120 days) | `RETENTION_DAYS` in `monitor/history.ts` |
| Weather window (7 days) | `WINDOW_DAYS` in `src/lib/weather.ts` |
| Colours and fonts | tokens at the top of `src/styles/app.css` |
| Links to the upstream repo | `REPO_URL` / `API_DRIFT_URL` in `src/components/Layout.tsx` |

## 6. Privacy checklist

- Only shapes are stored: types, formats, optional / nullable markers. Never values.
- But shapes of private APIs can still reveal things (field names, internal structure). If that matters,
  keep the repository **private** and don't publish Pages, or publish to a private Pages site.
- HAR files dropped on the Playground never leave the browser.

## 7. Keep the schedule alive

GitHub pauses scheduled workflows in public repos after 60 days of inactivity. The monitor commits at
least once a week (a heartbeat), so this only bites if commits fail; re-enable it from the Actions tab.
