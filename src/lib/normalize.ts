/**
 * Payload normalisation applied before shape inference (engine independent).
 *
 * 1. `ignore` paths: JSONPath-lite expressions (`$.releases`, `$.items[].debug`,
 *    `$.*.internal`) are pruned so volatile sub-trees never count as drift.
 * 2. Dynamic-key maps: objects whose keys are data (dates, versions, numeric ids,
 *    hashes, uuids), such as PyPI `releases` or jsDelivr `dates`, are collapsed to
 *    a single placeholder key like `<version>`. Without this every new release or
 *    every new day would be reported as a "new field".
 *
 * Neither step keeps values: only the structure flows on to inference.
 */

export type PathSegment = string; // property name, '*' (any key) or '[]' (each array item)

const TOKEN = /\.([^.[\]]+)|\[\]|\[\*\]|\[("(?:[^"\\]|\\.)*")\]/g;

/** Parses `$.a.b[].c` / `$["weird key"].x` into segments. */
export function parsePath(path: string): PathSegment[] {
  const trimmed = path.trim();
  if (!trimmed.startsWith('$')) throw new Error(`Path must start with $: ${path}`);
  const rest = trimmed.slice(1);
  const segments: PathSegment[] = [];
  let consumed = 0;
  for (const m of rest.matchAll(TOKEN)) {
    if (m.index !== consumed) throw new Error(`Cannot parse path: ${path}`);
    consumed += m[0].length;
    if (m[1] !== undefined) segments.push(m[1]);
    else if (m[2] !== undefined) segments.push(JSON.parse(m[2]) as string);
    else segments.push('[]');
  }
  if (consumed !== rest.length) throw new Error(`Cannot parse path: ${path}`);
  return segments;
}

function removeAt(value: unknown, segs: PathSegment[]): unknown {
  if (segs.length === 0) return value;
  const [head, ...rest] = segs;
  if (head === '[]') {
    if (!Array.isArray(value) || rest.length === 0) return value;
    return value.map((v) => removeAt(v, rest));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (head === '*' || k === head) {
      if (rest.length === 0) continue;
      out[k] = removeAt(v, rest);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Returns a copy of `value` without the given paths. */
export function removePaths(value: unknown, paths: string[] = []): unknown {
  let out = value;
  for (const p of paths) out = removeAt(out, parsePath(p));
  return out;
}

const KEY_PATTERNS: Array<[label: string, test: RegExp]> = [
  ['<date>', /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/],
  ['<uuid>', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ['<id>', /^-?\d+$/],
  ['<version>', /^v?\d+(\.\d+)+([-+._]?[0-9a-z]+)*$/i],
  ['<hash>', /^[0-9a-f]{8,}$/i],
];

const MIN_MAP_KEYS = 4;
const MAP_RATIO = 0.9;

/** Placeholder label when `keys` look like data rather than field names. */
export function dynamicKeyLabel(keys: string[]): string | null {
  if (keys.length < MIN_MAP_KEYS) return null;
  let best: [string, number] | null = null;
  for (const [label, test] of KEY_PATTERNS) {
    let hits = 0;
    for (const k of keys) if (test.test(k)) hits++;
    if (hits / keys.length >= MAP_RATIO && (!best || hits > best[1])) best = [label, hits];
  }
  return best ? best[0] : null;
}

function weight(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Collapses dynamic-key maps to `{ "<label>": representative }`, recursively. */
export function collapseDynamicKeys(value: unknown, depth = 0): unknown {
  if (depth > 40 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => collapseDynamicKeys(v, depth + 1));
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const label = dynamicKeyLabel(keys);
  if (label) {
    let rep: unknown = undefined;
    let repWeight = -1;
    for (const k of keys.slice(0, 500)) {
      const w = weight(obj[k]);
      if (w > repWeight) {
        rep = obj[k];
        repWeight = w;
      }
    }
    return { [label]: collapseDynamicKeys(rep, depth + 1) };
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = collapseDynamicKeys(obj[k], depth + 1);
  return out;
}

/** The full normalisation pipeline used by the monitor and the Playground. */
export function normalizePayload(value: unknown, options: { ignore?: string[]; collapseMaps?: boolean } = {}): unknown {
  const pruned = removePaths(value, options.ignore ?? []);
  return options.collapseMaps === false ? pruned : collapseDynamicKeys(pruned);
}

/** True for placeholder keys produced by {@link collapseDynamicKeys}. */
export function isMapKey(key: string): boolean {
  return /^<[\w -]+>$/.test(key);
}
