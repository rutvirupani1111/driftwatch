import { describe, expect, it } from 'vitest';
import { referencedSecrets, resolveRequest, substitute, validateConfig, type MonitorConfig } from '../monitor/config';
import { probe } from '../monitor/fetcher';
import { fakeFetch } from './helpers';

const monitor = (over: Partial<MonitorConfig> = {}): MonitorConfig => ({
  id: 'demo',
  name: 'Demo',
  category: 'Test',
  url: 'https://api.example.com/v1/thing',
  docs: 'https://example.com/docs',
  ...over,
});

describe('config validation', () => {
  it('accepts a valid config and fills defaults', () => {
    const { config, errors } = validateConfig({ monitors: [monitor()] }, {});
    expect(errors).toEqual([]);
    expect(config.timeoutMs).toBe(15_000);
    expect(config.schedule).toBe('17 */3 * * *');
    expect(config.monitors[0].method).toBe('GET');
    expect(config.site.url.endsWith('/')).toBe(true);
  });

  it('accepts a bare array and lets SITE_URL override the site URL', () => {
    const { config, errors } = validateConfig([monitor()], { SITE_URL: 'https://me.github.io/watch' });
    expect(errors).toEqual([]);
    expect(config.site.url).toBe('https://me.github.io/watch/');
  });

  it('reports every problem', () => {
    const { errors } = validateConfig({
      monitors: [monitor({ id: 'Bad Id' }), monitor(), monitor({ url: 'ftp://x' }), monitor({ id: 'demo2', method: 'BREW', ignore: ['nope'] }), monitor({ id: 'demo3', headers: { a: 1 as unknown as string } })],
    });
    expect(errors.join('\n')).toMatch(/lowercase slug/);
    expect(errors.join('\n')).toMatch(/http\(s\) URL/);
    expect(errors.join('\n')).toMatch(/method/);
    expect(errors.join('\n')).toMatch(/Path must start/);
    expect(errors.join('\n')).toMatch(/headers/);
    expect(validateConfig({}).errors).toContain('`monitors` must be an array');
  });
});

describe('secrets', () => {
  it('substitutes env vars and lists missing ones', () => {
    expect(substitute('Bearer ${TOKEN}', { TOKEN: 't0k' })).toEqual({ value: 'Bearer t0k', missing: [] });
    expect(substitute('${A}-${B}', { A: '1' })).toEqual({ value: '1-', missing: ['B'] });
  });

  it('drops headers whose secret is missing but blocks URLs that need one', () => {
    const m = monitor({ url: 'https://api.example.com/?key=${API_KEY}', headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' } });
    const r = resolveRequest(m, {});
    expect(r.headers.Authorization).toBeUndefined();
    expect(r.warnings[0]).toMatch(/GITHUB_TOKEN/);
    expect(r.missing).toEqual(['API_KEY']);
    const ok = resolveRequest(m, { API_KEY: 'k', GITHUB_TOKEN: 'g' }, 'UA/1');
    expect(ok.url).toBe('https://api.example.com/?key=k');
    expect(ok.headers).toMatchObject({ Authorization: 'Bearer g', 'User-Agent': 'UA/1', Accept: 'application/json' });
  });

  it('serialises JSON bodies with substitutions', () => {
    const r = resolveRequest(monitor({ method: 'POST', body: { q: '${Q}', n: 1 } }), { Q: 'he said "hi"' });
    expect(JSON.parse(r.body!)).toEqual({ q: 'he said "hi"', n: 1 });
    expect(r.headers['Content-Type']).toBe('application/json');
    expect(referencedSecrets([monitor({ url: 'https://x.dev/${A}', headers: { h: '${B}' }, body: { x: ['${C}'] } })])).toEqual(['A', 'B', 'C']);
  });
});

describe('probe', () => {
  const req = (url: string) => resolveRequest(monitor({ url }), {});

  it('measures a successful JSON response', async () => {
    const { fetch } = fakeFetch({ 'https://a.dev/ok': { body: { hello: 'world' } } });
    let t = 0;
    const r = await probe(fetch, req('https://a.dev/ok'), { timeoutMs: 1000, clock: () => (t += 50) });
    expect(r).toMatchObject({ ok: true, status: 200, latencyMs: 50, sizeBytes: 17, json: { hello: 'world' } });
  });

  it('classifies HTTP errors, non-JSON, broken JSON and empty bodies', async () => {
    const { fetch } = fakeFetch({
      'https://a.dev/503': { status: 503, body: { error: 'down' } },
      'https://a.dev/html': { text: '<html></html>', contentType: 'text/html' },
      'https://a.dev/broken': { text: '{"a":', contentType: 'application/json' },
      'https://a.dev/empty': { status: 204 },
    });
    const o = { timeoutMs: 1000 };
    expect((await probe(fetch, req('https://a.dev/503'), o)).error?.code).toBe('http_503');
    expect((await probe(fetch, req('https://a.dev/html'), o)).error?.code).toBe('not_json');
    expect((await probe(fetch, req('https://a.dev/broken'), o)).error?.code).toBe('invalid_json');
    expect((await probe(fetch, req('https://a.dev/empty'), o)).error?.code).toBe('empty_body');
  });

  it('times out and survives network errors', async () => {
    const { fetch } = fakeFetch({ 'https://a.dev/hang': { hang: true }, 'https://a.dev/dns': { fail: 'ENOTFOUND' } });
    const slow = await probe(fetch, req('https://a.dev/hang'), { timeoutMs: 50 });
    expect(slow).toMatchObject({ ok: false, status: 0, error: { code: 'timeout' } });
    const dns = await probe(fetch, req('https://a.dev/dns'), { timeoutMs: 1000 });
    expect(dns.error).toEqual({ code: 'network', message: 'DNS lookup failed' });
  });

  it('sends the polite user agent', async () => {
    const { fetch, calls } = fakeFetch({ 'https://a.dev/ok': { body: {} } });
    await probe(fetch, resolveRequest(monitor({ url: 'https://a.dev/ok' }), {}), { timeoutMs: 1000 });
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toMatch(/^Driftwatch \(\+https:\/\/github\.com\//);
  });
});
