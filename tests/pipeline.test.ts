import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateConfig, type MonitorConfig } from '../monitor/config';
import { parseHistory } from '../monitor/history';
import { learn, runMonitor, summarizeChanges } from '../monitor/pipeline';
import { restoreFromCache } from '../monitor/store';
import { infer, sampleCount, toContract } from '../src/lib/drift';
import type { ApiLatest, ChangeEvent, ChangesFile, IndexFile } from '../src/lib/types';
import { DAY, fakeClock, fakeFetch, HOUR, tempDir } from './helpers';

const REPO_URL = 'https://api.example.com/repos/demo';
const PRICE_URL = 'https://api.example.com/price';
const SECRET = 's3cr3t-token-value';

const monitors: MonitorConfig[] = [
  {
    id: 'repo',
    name: 'Example repo',
    category: 'Dev',
    url: REPO_URL,
    headers: { Authorization: 'Bearer ${DEMO_TOKEN}' },
    docs: 'https://example.com/docs',
    ignore: ['$.meta.debug'],
  },
  { id: 'price', name: 'Example price', category: 'Money', url: PRICE_URL, docs: 'https://example.com/docs' },
];

const repoV1 = { id: 1, name: 'demo', license: { key: 'mit' }, topics: ['a'], created_at: '2026-01-01T00:00:00Z', meta: { debug: 'x' } };
const priceV1 = { usd: 101.5, updated: 1792700000 };

function setup(env: Record<string, string> = { DEMO_TOKEN: SECRET, DISCORD_WEBHOOK_URL: 'https://discord.test/hook', SLACK_WEBHOOK_URL: 'https://slack.test/hook' }) {
  const { config } = validateConfig({ site: { url: 'https://me.github.io/driftwatch/' }, monitors }, env);
  const fake = fakeFetch({
    [REPO_URL]: { body: repoV1 },
    [PRICE_URL]: { body: priceV1 },
    'https://discord.test/hook': { status: 204 },
    'https://slack.test/hook': { text: 'ok', contentType: 'text/plain' },
  });
  return { config, fake, env };
}

describe('runMonitor (offline, fake fetch)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let dataDir: string;
  let publicDir: string;
  const clock = fakeClock(Date.parse('2026-10-20T00:17:00Z'));

  beforeEach(() => {
    tmp = tempDir('pipeline-');
    dataDir = join(tmp.dir, 'data');
    publicDir = join(tmp.dir, 'public');
    clock.set('2026-10-20T00:17:00Z');
  });
  afterEach(() => tmp.cleanup());

  const run = (s: ReturnType<typeof setup>, extra: Partial<Parameters<typeof runMonitor>[0]> = {}) =>
    runMonitor({ config: s.config, dataDir, publicDir, fetch: s.fake.fetch, env: s.env, now: clock.now, clock: () => 0, ...extra });
  const latest = (id: string) => JSON.parse(readFileSync(join(dataDir, 'apis', id, 'latest.json'), 'utf8')) as ApiLatest;
  const changes = (id: string) => JSON.parse(readFileSync(join(dataDir, 'apis', id, 'changes.json'), 'utf8')) as ChangeEvent[];
  const index = () => JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8')) as IndexFile;

  it('learns a baseline, stays quiet when nothing changes, then reports drift', async () => {
    const s = setup();

    // Run 1: first observation
    const r1 = await run(s);
    expect(r1.changed).toBe(true);
    expect(r1.events).toHaveLength(0);
    expect(r1.results.every((r) => r.isNew)).toBe(true);
    expect(latest('repo').weather.condition).toBe('sunny');
    expect(latest('repo').contract?.properties?.meta.properties?.debug).toBeUndefined(); // ignored path
    expect(index().counts.sunny).toBe(2);

    // Run 2: same shapes, different values → nothing to commit
    clock.advance(3 * HOUR);
    s.fake.routes[PRICE_URL] = { body: { usd: 99, updated: 1792710000 } };
    const r2 = await run(s);
    expect(r2.changed).toBe(false);
    expect(r2.events).toHaveLength(0);

    // Run 3: a breaking change in the repo API
    clock.advance(3 * HOUR);
    s.fake.routes[REPO_URL] = { body: { id: '1', name: 'demo', topics: [], created_at: '2026-01-01T00:00:00Z', stars: 5 } };
    const r3 = await run(s);
    expect(r3.changed).toBe(true);
    expect(r3.events).toHaveLength(1);
    const ev = r3.events[0];
    expect(ev.severity).toBe('breaking');
    expect(ev.changes.map((c) => `${c.severity}:${c.kind}:${c.path}`)).toEqual(
      expect.arrayContaining(['breaking:removed:$.license', 'breaking:type-changed:$.id', 'info:added:$.stars']),
    );
    expect(changes('repo')).toHaveLength(1);
    expect(latest('repo').weather.condition).toBe('storm');
    expect(latest('repo').lastChange?.severity).toBe('breaking');
    expect(index().counts).toMatchObject({ storm: 1, sunny: 1 });
    expect(index().recent[0]).toMatchObject({ apiId: 'repo', severity: 'breaking' });

    // feeds, badges, global changelog
    const feed = readFileSync(join(publicDir, 'feed.xml'), 'utf8');
    expect(feed).toContain('[breaking] Example repo');
    expect(feed).toContain('https://me.github.io/driftwatch/api/repo#');
    expect(readFileSync(join(publicDir, 'feeds', 'repo.xml'), 'utf8')).toContain('<entry>');
    expect(readFileSync(join(publicDir, 'feeds', 'price.xml'), 'utf8')).not.toContain('<entry>');
    expect(readFileSync(join(publicDir, 'badges', 'repo.svg'), 'utf8')).toContain('breaking just now');
    expect(readFileSync(join(publicDir, 'badges', 'price.svg'), 'utf8')).toContain('stable');
    const global = JSON.parse(readFileSync(join(dataDir, 'changes.json'), 'utf8')) as ChangesFile;
    expect(global.events).toHaveLength(1);

    // alerts went to both webhooks
    const hooks = s.fake.calls.filter((c) => c.url.includes('.test/hook'));
    expect(hooks.map((c) => c.url).sort()).toEqual(['https://discord.test/hook', 'https://slack.test/hook']);
    expect(String(hooks[0].init.body)).toContain('Example repo');
    expect(r3.alerts.every((a) => a.ok)).toBe(true);

    // Run 4: the same drift again is not re-reported (the baseline learned it)
    clock.advance(3 * HOUR);
    const r4 = await run(s);
    expect(r4.events).toHaveLength(0);

    // Run 5: outage → fog, baseline kept, history records the failure
    clock.advance(3 * HOUR);
    s.fake.routes[REPO_URL] = { status: 503, body: { error: 'maintenance' } };
    const fpBefore = latest('repo').fingerprint;
    const r5 = await run(s);
    expect(r5.changed).toBe(true);
    expect(r5.results.find((r) => r.id === 'repo')?.statusChanged).toBe(true);
    expect(latest('repo').weather.condition).toBe('fog');
    expect(latest('repo').fingerprint).toBe(fpBefore);
    const hist = parseHistory(readFileSync(join(dataDir, 'apis', 'repo', 'history.jsonl'), 'utf8'));
    expect(hist).toHaveLength(5);
    expect(hist.at(-1)).toMatchObject({ ok: 0, s: 503, e: 'http_503' });
    expect(latest('repo').stats.d7.uptime).toBeCloseTo(4 / 5);

    // eight days later the storm has passed
    clock.advance(8 * DAY);
    s.fake.routes[REPO_URL] = { body: { id: '2', name: 'demo', topics: ['b'], created_at: '2026-01-01T00:00:00Z', stars: 9 } };
    await run(s);
    expect(latest('repo').weather.condition).toBe('sunny');
  });

  it('never writes secrets to disk and sends them only to the API', async () => {
    const s = setup();
    await run(s);
    const repoCall = s.fake.calls.find((c) => c.url === REPO_URL);
    expect((repoCall?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(tmp.dir);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toContain(SECRET);
    expect(latest('repo').url).toBe(REPO_URL);
  });

  it('marks a missing URL secret as a config error (fog) without calling the API', async () => {
    const { config } = validateConfig({ monitors: [{ ...monitors[1], url: 'https://api.example.com/price?key=${PRICE_KEY}' }] }, {});
    const fake = fakeFetch({});
    const r = await runMonitor({ config, dataDir, publicDir, fetch: fake.fetch, env: {}, now: clock.now });
    expect(fake.calls).toHaveLength(0);
    expect(r.results[0]).toMatchObject({ ok: false, condition: 'fog', error: 'Missing secret ${PRICE_KEY}' });
  });

  it('re-baselines on request or when the engine changes, and supports --only', async () => {
    const s = setup({});
    await run(s);
    clock.advance(HOUR);
    s.fake.routes[PRICE_URL] = { body: { usd: '101.5', updated: 1 } };
    const r = await run(s, { rebaseline: ['price'], only: ['price'] });
    expect(r.results).toHaveLength(1);
    expect(r.results[0].rebaselined).toBe(true);
    expect(r.events).toHaveLength(0);
    expect(index().total).toBe(2); // the repo kept its stored state

    const file = join(dataDir, 'apis', 'price', 'latest.json');
    const stored = JSON.parse(readFileSync(file, 'utf8')) as ApiLatest;
    writeFileSync(file, JSON.stringify({ ...stored, engine: 'some-other-engine@0' }));
    clock.advance(HOUR);
    s.fake.routes[PRICE_URL] = { body: { usd: 1, updated: 1 } };
    const r2 = await run(s, { only: ['price'] });
    expect(r2.results[0].rebaselined).toBe(true);
    expect(r2.results[0].warnings.join()).toMatch(/engine changed/);
    expect(r2.events).toHaveLength(0);
  });

  it('only alerts on breaking or risky changes', async () => {
    const s = setup();
    await run(s);
    clock.advance(HOUR);
    s.fake.routes[PRICE_URL] = { body: { ...priceV1, eur: 93.1 } };
    const r = await run(s);
    expect(r.events[0].severity).toBe('info');
    expect(r.alerts).toEqual([]);
  });

  it('restores a newer cached state by merging histories', async () => {
    const s = setup({});
    await run(s);
    const cache = tempDir('cache-');
    try {
      const cacheData = join(cache.dir, 'data');
      clock.advance(3 * HOUR);
      await runMonitor({ config: s.config, dataDir: cacheData, publicDir: join(cache.dir, 'public'), fetch: s.fake.fetch, env: {}, now: clock.now });
      clock.advance(3 * HOUR);
      await runMonitor({ config: s.config, dataDir: cacheData, publicDir: join(cache.dir, 'public'), fetch: s.fake.fetch, env: {}, now: clock.now });
      const res = restoreFromCache(cacheData, dataDir, clock.now());
      expect(res.restored).toBe(true);
      const hist = parseHistory(readFileSync(join(dataDir, 'apis', 'price', 'history.jsonl'), 'utf8'));
      expect(hist).toHaveLength(3);
      expect(restoreFromCache(cacheData, dataDir, clock.now()).restored).toBe(false);
      expect(restoreFromCache(join(cache.dir, 'nothing'), dataDir, clock.now()).restored).toBe(false);
    } finally {
      cache.cleanup();
    }
    expect(existsSync(join(dataDir, 'index.json'))).toBe(true);
  });
});

describe('learn', () => {
  const m = monitors[1];
  it('folds observations and only reports when the contract changes', () => {
    const first = learn(m, { samples: 0 }, { a: 1 }, '2026-10-20T00:00:00.000Z');
    expect(first.event).toBeUndefined();
    expect(first.samples).toBe(1);
    const same = learn(m, first, { a: 2 }, '2026-10-20T03:00:00.000Z');
    expect(same.event).toBeUndefined();
    expect(same.fingerprint).toBe(first.fingerprint);
    expect(same.contractSince).toBe(first.contractSince);
    const changed = learn(m, same, { a: 2, b: true }, '2026-10-20T06:00:00.000Z');
    expect(changed.event?.severity).toBe('info');
    expect(changed.contractSince).toBe('2026-10-20T06:00:00.000Z');
    expect(toContract(changed.shape!)).toEqual(changed.contract);
    // b was absent before it appeared, so it is optional: missing again is no news
    expect(learn(m, changed, { a: 3 }, '2026-10-20T09:00:00.000Z').event).toBeUndefined();
    expect(sampleCount(infer({}))).toBe(1);
  });

  it('reports a flapping required field once, then stays quiet', () => {
    let state = learn(m, { samples: 0 }, { a: 1, b: 'x' }, '2026-10-20T00:00:00.000Z');
    state = learn(m, state, { a: 2, b: 'y' }, '2026-10-20T03:00:00.000Z');
    const absent = learn(m, state, { a: 3 }, '2026-10-20T06:00:00.000Z');
    expect(absent.event?.changes[0]).toMatchObject({ kind: 'removed', path: '$.b', severity: 'breaking' });
    expect(absent.contract?.properties?.b.optional).toBe(true);
    const again = learn(m, absent, { a: 4 }, '2026-10-20T09:00:00.000Z');
    expect(again.event).toBeUndefined();
    expect(learn(m, again, { a: 5, b: 'z' }, '2026-10-20T12:00:00.000Z').event).toBeUndefined();
  });

  it('summarises change lists', () => {
    expect(
      summarizeChanges([
        { path: '$.a', kind: 'removed', severity: 'breaking', message: 'field is missing (was present in the baseline sample)' },
        { path: '$.b', kind: 'added', severity: 'info', message: 'new field (string)' },
      ]),
    ).toBe('$.a: field is missing (was present in the baseline sample); +1 more (1 breaking, 1 info)');
  });
});
