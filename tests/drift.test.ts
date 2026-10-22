import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_KEY,
  ENGINE,
  ENGINE_LABEL,
  countFields,
  diff,
  endpointKey,
  fingerprint,
  importHar,
  infer,
  maxSeverity,
  merge,
  nodeAt,
  restoreShape,
  sampleCount,
  toContract,
  toTypeScript,
  toZod,
  typeText,
  type DriftChange,
} from '../src/lib/drift';

/** Tests for the api-drift adapter: Driftwatch's contract over the engine. */

const contractOf = (v: unknown) => toContract(infer(v));
const kinds = (changes: DriftChange[]) => changes.map((c) => `${c.severity}:${c.kind}:${c.path}`);
const learnAll = (...values: unknown[]) => values.map((v) => infer(v)).reduce((a, b) => merge(a, b));

describe('infer → contract', () => {
  it('captures kinds and formats, never values', () => {
    const c = contractOf({ id: 1, price: 9.5, name: 'x', ok: true, none: null, tags: ['a'], nested: { at: '2026-10-23T03:17:00Z' } });
    expect(c.properties?.id.type).toBe('integer');
    expect(c.properties?.price.type).toBe('number');
    expect(c.properties?.name.type).toBe('string');
    expect(c.properties?.ok.type).toBe('boolean');
    expect(c.properties?.none.type).toBe('null');
    expect(c.properties?.tags.items?.type).toBe('string');
    expect(c.properties?.nested.properties?.at.format).toBe('date-time');
    expect(JSON.stringify(c)).not.toContain('2026-10-23T03:17');
  });

  it('does not capture enum values (enums are values)', () => {
    const many = Array.from({ length: 30 }, () => ({ status: 'active' }));
    const shape = infer(many);
    expect(JSON.stringify(shape)).not.toContain('active');
    expect(toContract(shape).items?.properties?.status.enum).toBeUndefined();
  });

  it('marks optional properties inside arrays and collapses id-keyed objects', () => {
    const c = contractOf({ list: [{ a: 1, b: 'x' }, { a: 2 }], byId: { '1001': { n: 1 }, '1002': { n: 2 } } });
    expect(c.properties?.list.items?.properties?.a.optional).toBeUndefined();
    expect(c.properties?.list.items?.properties?.b.optional).toBe(true);
    expect(Object.keys(c.properties?.byId.properties ?? {})).toEqual([DYNAMIC_KEY]);
  });

  it('survives deep nesting', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 40; i++) deep = { x: deep };
    expect(() => contractOf(deep)).not.toThrow();
  });
});

describe('merge', () => {
  it('is commutative and idempotent on structure', () => {
    const a = infer({ id: 1, name: 'a', meta: null });
    const b = infer({ id: 2.5, extra: true, meta: { k: 'v' } });
    expect(fingerprint(toContract(merge(a, b)))).toBe(fingerprint(toContract(merge(b, a))));
    expect(fingerprint(toContract(merge(a, a)))).toBe(fingerprint(toContract(a)));
    expect(sampleCount(merge(a, b))).toBe(2);
  });

  it('widens integers to numbers and builds nullable types', () => {
    const c = toContract(merge(infer({ v: 1, s: 'x' }), infer({ v: 1.5, s: null })));
    expect(c.properties?.v.type).toBe('number');
    expect(c.properties?.s).toMatchObject({ type: 'string', nullable: true });
    expect(typeText(c.properties?.s)).toBe('string | null');
  });
});

describe('diff (api-drift semantics)', () => {
  const base = infer({ id: 1, name: 'n', price: 3, homepage: 'https://x.dev', items: [{ sku: 'a' }], owner: { login: 'o' } });

  it('reports nothing when only values change', () => {
    expect(diff(base, infer({ id: 9, name: 'm', price: 4, homepage: 'https://y.dev', items: [{ sku: 'b' }], owner: { login: 'p' } }))).toEqual([]);
  });

  it('flags removed fields and type changes as breaking', () => {
    const changes = diff(base, infer({ id: '1', price: 3, homepage: 'https://x.dev', items: [{ sku: 'a' }], owner: 'o' }));
    expect(kinds(changes)).toEqual(expect.arrayContaining(['breaking:removed:$.name', 'breaking:type-changed:$.id', 'breaking:type-changed:$.owner']));
    expect(maxSeverity(changes)).toBe('breaking');
  });

  it('flags nullability and format loss as risky', () => {
    const changes = diff(base, infer({ id: 1, name: null, price: 3, homepage: 'not a url', items: [{ sku: 'a' }], owner: { login: 'o' } }));
    expect(kinds(changes)).toEqual(expect.arrayContaining(['risky:nullable:$.name', 'risky:format-changed:$.homepage']));
  });

  it('reports decimals only after enough integer evidence', () => {
    expect(diff(infer({ v: 3 }), infer({ v: 3.5 }))).toEqual([]);
    const learned = learnAll(...Array.from({ length: 10 }, (_, i) => ({ v: i })));
    expect(kinds(diff(learned, infer({ v: 3.5 })))).toEqual(['risky:number-widened:$.v']);
  });

  it('treats new fields as info and ignores absent optional fields', () => {
    const changes = diff(base, infer({ id: 1, name: 'n', price: 3, homepage: 'https://x.dev', items: [{ sku: 'a', qty: 1 }], owner: { login: 'o' }, extra: true }));
    expect(kinds(changes).sort()).toEqual(['info:added:$.extra', 'info:added:$.items[].qty']);
    expect(diff(learnAll({ a: 1, b: 2 }, { a: 1 }), infer({ a: 5 }))).toEqual([]);
  });

  it('attaches type text and contract fragments to each change', () => {
    const [change] = diff(infer({ when: '2026-10-23T00:00:00Z' }), infer({ when: 1792700000 }));
    expect(change).toMatchObject({ kind: 'type-changed', path: '$.when', before: 'string<date-time>', after: 'integer' });
    expect(change.beforeNode).toMatchObject({ type: 'string', format: 'date-time' });
    expect(change.afterNode).toMatchObject({ type: 'integer' });
    const [emptied] = diff(infer({ 'odd key': [1] }), infer({ 'odd key': [] }));
    expect(emptied).toMatchObject({ kind: 'emptied', severity: 'risky', path: '$["odd key"]' });
  });
});

describe('contract helpers', () => {
  it('fingerprints structure, not values or key order', () => {
    expect(fingerprint(contractOf({ a: 1, b: 'x' }))).toBe(fingerprint(contractOf({ b: 'y', a: 2 })));
    expect(fingerprint(contractOf({ a: 1 }))).not.toBe(fingerprint(contractOf({ a: '1' })));
    expect(ENGINE).toBe('api-drift/shape@1');
    expect(ENGINE_LABEL).toMatch(/^api-drift /);
  });

  it('counts fields and resolves api-drift paths', () => {
    const c = contractOf({ a: 1, b: { c: [{ d: 1 }] }, 'odd key': { '1001': true, '1002': false } });
    expect(countFields(c)).toBe(6);
    expect(nodeAt(c, '$.b.c[].d')?.type).toBe('integer');
    expect(nodeAt(c, '$["odd key"].*')?.type).toBe('boolean');
    expect(nodeAt(c, '$.nope')).toBeUndefined();
    expect(nodeAt(c, '$')).toBe(c);
  });

  it('validates stored shapes', () => {
    const shape = infer({ a: [1, 2] });
    expect(restoreShape(JSON.parse(JSON.stringify(shape)))).toEqual(shape);
    expect(restoreShape({ k: 'object', n: 1, p: {} })).toBeNull();
    expect(restoreShape(undefined)).toBeNull();
  });
});

describe('type generation', () => {
  const shape = infer({ id: 1, 'user-name': 'x', created_at: '2026-10-23T00:00:00Z', tags: ['a'], parent: null, score: 1.5 });

  it('emits TypeScript through api-drift', () => {
    const ts = toTypeScript(shape, 'github repo');
    expect(ts).toContain('GithubRepo');
    expect(ts).toMatch(/"user-name"\??: string/);
    expect(ts).toMatch(/created_at\??: string/);
    expect(ts).toMatch(/tags\??: (string\[\]|Array<string>)/);
  });

  it('emits Zod through api-drift', () => {
    const zod = toZod(shape, 'repo');
    expect(zod.startsWith("import { z } from 'zod';")).toBe(true);
    expect(zod).toContain('z.object(');
    expect(zod).toContain('created_at');
    expect(zod).toMatch(/z\.infer<typeof Repo/);
  });

  it('renders stored contracts (no engine shape) structurally, maps as records', () => {
    const map = { type: 'object' as const, properties: { '<date>': { type: 'integer' as const } } };
    expect(toTypeScript(map, 'Hits')).toContain('export type Hits = Record<string, number>;');
    expect(toZod(map, 'Hits')).toContain('z.record(z.string(), z.number().int())');
    expect(typeText(map)).toBe('{ <date> }');
  });
});

describe('endpoint keys and HAR import', () => {
  it('templates id-like path segments', () => {
    expect(endpointKey('get', 'https://api.example.com/v1/users/123/orders/3f2b8c1e-5a6d-4c1a-9e2f-0b1c2d3e4f5a?x=1', 200)).toBe(
      'GET api.example.com /v1/users/:id/orders/:id 2xx',
    );
    expect(endpointKey('GET', 'https://openlibrary.org/works/OL45804W.json', 404)).toBe('GET openlibrary.org /works/:id 4xx');
  });

  it('groups JSON responses by endpoint and merges samples', () => {
    const entry = (url: string, body: unknown, mimeType = 'application/json') => ({
      request: { method: 'GET', url },
      response: { status: 200, content: { mimeType, text: JSON.stringify(body) } },
    });
    const har = {
      log: {
        entries: [
          entry('https://api.example.com/users/1', { id: 1, name: 'a' }),
          entry('https://api.example.com/users/2', { id: 2, name: 'b', email: 'b@example.com' }),
          entry('https://api.example.com/logo.png', 'x', 'image/png'),
          { request: { method: 'GET', url: 'https://api.example.com/broken' }, response: { status: 200, content: { mimeType: 'application/json', text: '{oops' } } },
        ],
      },
    };
    const result = importHar(har);
    expect(result.totalEntries).toBe(4);
    expect(result.skipped).toBe(2);
    expect(result.warnings).toEqual(['1 entry skipped: invalid JSON']);
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]).toMatchObject({ key: 'GET api.example.com /users/:id 2xx', method: 'GET', host: 'api.example.com', path: '/users/:id', samples: 2 });
    expect(result.endpoints[0].contract.properties?.email.optional).toBe(true);
    expect(() => importHar({ nope: true })).toThrow(/HAR/);
  });
});
