/**
 * `npm run monitor` — checks every API in driftwatch.config.json once.
 *
 *   --config <file>        config path (default driftwatch.config.json)
 *   --data <dir>           data directory (default data)
 *   --public <dir>         public directory for feeds and badges (default public)
 *   --only a,b             check only these ids
 *   --rebaseline a,b|all   forget the learned contract and start over
 *   --restore <dir>        merge a cached state directory first (GitHub Actions cache)
 *   --no-alerts            never post webhooks
 *
 * Environment: SITE_URL, DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL, any ${SECRET}
 * referenced by the config, GITHUB_OUTPUT / GITHUB_STEP_SUMMARY in Actions.
 */

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forecastPhrase } from '../src/lib/weather';
import { loadConfig } from './config';
import { runMonitor } from './pipeline';
import { restoreFromCache } from './store';
import { stepSummary } from './summary';

interface Args {
  config: string;
  data: string;
  public: string;
  only?: string[];
  rebaseline?: string[] | 'all';
  restore?: string;
  alerts: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { config: 'driftwatch.config.json', data: 'data', public: 'public', alerts: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--config') args.config = next();
    else if (a === '--data') args.data = next();
    else if (a === '--public') args.public = next();
    else if (a === '--only') args.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--rebaseline') {
      const v = next();
      args.rebaseline = v === 'all' ? 'all' : v.split(',').map((s) => s.trim());
    } else if (a === '--restore') args.restore = next();
    else if (a === '--no-alerts') args.alerts = false;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: npm run monitor -- [--only id,id] [--rebaseline id|all] [--restore dir] [--no-alerts]');
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env as Record<string, string | undefined>;
  const config = loadConfig(resolve(args.config), env);
  const dataDir = resolve(args.data);
  const publicDir = resolve(args.public);

  if (args.restore) {
    const r = restoreFromCache(resolve(args.restore), dataDir, Date.now());
    console.log(`state cache: ${r.restored ? 'restored' : 'skipped'} (${r.reason})`);
  }
  if (args.only) {
    const unknown = args.only.filter((id) => !config.monitors.some((m) => m.id === id));
    if (unknown.length) throw new Error(`Unknown monitor id(s): ${unknown.join(', ')}`);
  }

  console.log(`Driftwatch: checking ${args.only?.length ?? config.monitors.length} API(s) with up to ${config.concurrency} in flight…`);
  const run = await runMonitor({
    config,
    dataDir,
    publicDir,
    fetch: (url, init) => fetch(url, init),
    env,
    only: args.only,
    rebaseline: args.rebaseline,
    alerts: args.alerts,
    log: (m) => console.log(m),
  });

  console.log('');
  console.log(`Forecast: ${forecastPhrase(run.index.counts)} (${run.index.total} APIs) in ${(run.durationMs / 1000).toFixed(1)} s`);
  console.log(`New change events: ${run.events.length}. Data ${run.changed ? 'changed' : 'unchanged'}.`);

  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `changed=${run.changed}\nevents=${run.events.length}\nheadline=${forecastPhrase(run.index.counts)}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, stepSummary(run));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
