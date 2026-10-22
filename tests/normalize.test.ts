import { describe, expect, it } from 'vitest';
import { collapseDynamicKeys, dynamicKeyLabel, isMapKey, normalizePayload, parsePath, removePaths } from '../src/lib/normalize';

describe('parsePath', () => {
  it('parses dotted, array and quoted segments', () => {
    expect(parsePath('$.a.b')).toEqual(['a', 'b']);
    expect(parsePath('$.items[].price')).toEqual(['items', '[]', 'price']);
    expect(parsePath('$["odd key"].x')).toEqual(['odd key', 'x']);
    expect(parsePath('$.*.debug')).toEqual(['*', 'debug']);
  });

  it('rejects paths without a root', () => {
    expect(() => parsePath('a.b')).toThrow();
  });
});

describe('removePaths', () => {
  const payload = { keep: 1, meta: { debug: true, id: 2 }, items: [{ price: 1, tracking: 'x' }, { price: 2, tracking: 'y' }] };

  it('removes nested keys, array item keys and wildcards without mutating input', () => {
    expect(removePaths(payload, ['$.meta.debug', '$.items[].tracking'])).toEqual({ keep: 1, meta: { id: 2 }, items: [{ price: 1 }, { price: 2 }] });
    expect(removePaths(payload, ['$.*.debug'])).toEqual({ ...payload, meta: { id: 2 } });
    expect(payload.meta.debug).toBe(true);
  });
});

describe('dynamic-key maps', () => {
  it('labels date, version and id keyed objects', () => {
    expect(dynamicKeyLabel(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])).toBe('<date>');
    expect(dynamicKeyLabel(['1.0.0', '2.0.0rc1', '2.32.3', '0.2'])).toBe('<version>');
    expect(dynamicKeyLabel(['1', '2', '3', '42'])).toBe('<id>');
    expect(dynamicKeyLabel(['name', 'version', 'license', 'author'])).toBeNull();
    expect(dynamicKeyLabel(['2026-10-01', '2026-10-02'])).toBeNull();
  });

  it('collapses maps to the richest representative, recursively', () => {
    const value = {
      releases: { '1.0.0': [], '1.1.0': [{ filename: 'a', size: 1 }], '1.2.0': [], '2.0.0': [] },
      info: { version: '2.0.0' },
    };
    const out = collapseDynamicKeys(value) as { releases: Record<string, unknown> };
    expect(Object.keys(out.releases)).toEqual(['<version>']);
    expect(out.releases['<version>']).toEqual([{ filename: 'a', size: 1 }]);
    expect(isMapKey('<version>')).toBe(true);
    expect(isMapKey('version')).toBe(false);
  });

  it('can be switched off', () => {
    const v = { a: { '1': 1, '2': 2, '3': 3, '4': 4 } };
    expect(normalizePayload(v, { collapseMaps: false })).toEqual(v);
    expect(normalizePayload(v)).toEqual({ a: { '<id>': 1 } });
  });
});
