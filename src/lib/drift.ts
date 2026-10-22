/**
 * drift.ts: the ONLY module in Driftwatch that talks to api-drift.
 *
 * Everything Driftwatch needs from the contract engine goes through the
 * functions exported here: infer, merge, diff, the display contract tree,
 * TypeScript / Zod generation, endpoint keys and HAR import. Swapping how
 * api-drift is resolved (sibling source today, the GitHub/npm package later)
 * never touches this file: `api-drift/core` is mapped by the Vite alias, the
 * tsconfig `paths` and, once installed, node_modules. See DEPLOY.md.
 *
 * Browser-safe: used by the monitor (Node, via tsx) and the Playground.
 */

import {
  VERSION,
  countOf,
  describe,
  diff as engineDiff,
  endpointKey as engineEndpointKey,
  formatOf,
  importHar as engineImportHar,
  infer as engineInfer,
  isEnum,
  merge as engineMerge,
  normalizeShape,
  parseEndpointKey,
  shapeToSource,
  variantsOf,
  type Change,
  type LeafShape,
  type Shape as EngineShape,
} from 'api-drift/core';

export type Severity = 'breaking' | 'risky' | 'info';

export const SEVERITY_RANK: Record<Severity, number> = { breaking: 3, risky: 2, info: 1 };

/**
 * Identifies the *shape format* stored in data files. Stored shapes from a
 * different engine are never diffed against new ones: the monitor re-baselines.
 * Minor api-drift upgrades keep the format (shapes are validated on load).
 */
export const ENGINE = 'api-drift/shape@1';

/** Human-friendly engine description for footers and the About page. */
export const ENGINE_LABEL = `api-drift ${VERSION}`;

// ---------------------------------------------------------------------------
// Engine-independent types (what Driftwatch stores and renders)
// ---------------------------------------------------------------------------

export type ContractType = 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'union' | 'unknown';

/** A display-oriented, structure-only view of a learned shape. Never holds values. */
export interface ContractNode {
  type: ContractType;
  /** `null` was also observed at this position. */
  nullable?: boolean;
  /** (object properties) the key was missing from at least one observed object. */
  optional?: boolean;
  /** (strings) detected format: date-time, uri, uuid, email, semver... */
  format?: string;
  /** (strings) low-cardinality code values, only when enum capture is on. */
  enum?: string[];
  /** (objects) named properties; `<key>` holds values under dynamic keys. */
  properties?: Record<string, ContractNode>;
  /** (arrays) merged item contract; absent when only empty arrays were seen. */
  items?: ContractNode;
  /** (unions) one entry per non-null type. */
  anyOf?: ContractNode[];
}

/** api-drift change kinds (plus the legacy kinds of the pre-api-drift engine, kept for old data). */
export type ChangeKind = Change['kind'] | (string & {});

export interface DriftChange {
  /** JSONPath-like location, e.g. `$.data.items[].price` */
  path: string;
  kind: ChangeKind;
  severity: Severity;
  /** one readable sentence (without the path) */
  message: string;
  /** compact description of the baseline / observation, e.g. `string<date-time>` */
  before?: string;
  after?: string;
  /** structure fragments at `path` (trimmed), before / after */
  beforeNode?: ContractNode;
  afterNode?: ContractNode;
}

/** Opaque engine shape: store it, hand it back, never look inside outside this file. */
export type Shape = EngineShape;

export interface InferOptions {
  /** capture low-cardinality code-like strings as enums (default false: values are data) */
  enums?: boolean;
}

/** Placeholder key under which values of dynamic-key objects are shown. */
export const DYNAMIC_KEY = '<key>';

// ---------------------------------------------------------------------------
// Inference, learning, diffing
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 5_000_000;

/** Infers the shape of one JSON value (values are discarded). */
export function infer(value: unknown, options: InferOptions = {}): Shape {
  return engineInfer(value, { enums: options.enums ?? false, maxPayloadBytes: MAX_PAYLOAD_BYTES });
}

/** Merges two shapes: the learned contract of both observations. */
export function merge(a: Shape, b: Shape): Shape {
  return engineMerge(a, b);
}

/** Number of observations folded into a shape. */
export function sampleCount(shape: Shape): number {
  return countOf(shape);
}

/** Validates a stored shape; returns null when it is not an api-drift shape. */
export function restoreShape(value: unknown): Shape | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return normalizeShape(value);
  } catch {
    return null;
  }
}

function leafNode(v: LeafShape): ContractNode {
  switch (v.kind) {
    case 'string': {
      const node: ContractNode = { type: 'string' };
      const f = formatOf(v);
      if (f) node.format = f;
      if (isEnum(v) && v.values) node.enum = [...v.values];
      return node;
    }
    case 'array':
      return v.items ? { type: 'array', items: shapeNode(v.items) } : { type: 'array' };
    case 'object': {
      const properties: Record<string, ContractNode> = {};
      for (const key of Object.keys(v.properties)) {
        const child = shapeNode(v.properties[key]);
        if (countOf(v.properties[key]) < v.count) child.optional = true;
        properties[key] = child;
      }
      if (v.additional) properties[DYNAMIC_KEY] = shapeNode(v.additional);
      return { type: 'object', properties };
    }
    default:
      return { type: v.kind };
  }
}

function shapeNode(shape: Shape): ContractNode {
  const variants = variantsOf(shape);
  const nonNull = variants.filter((v) => v.kind !== 'null');
  const nullable = nonNull.length !== variants.length;
  if (nonNull.length === 0) return { type: 'null' };
  if (nonNull.length === 1) {
    const node = leafNode(nonNull[0]);
    if (nullable) node.nullable = true;
    return node;
  }
  const node: ContractNode = { type: 'union', anyOf: nonNull.map(leafNode) };
  if (nullable) node.nullable = true;
  return node;
}

/** Converts an engine shape to Driftwatch's structure-only contract tree. */
export function toContract(shape: Shape): ContractNode {
  return shapeNode(shape);
}

/**
 * Diffs a learned baseline against an observation. Only evidence the baseline
 * did not allow is reported (api-drift semantics). Each change carries the
 * contract fragments found at its path.
 */
export function diff(baseline: Shape, current: Shape): DriftChange[] {
  const changes = engineDiff(baseline, current);
  const before = toContract(baseline);
  const after = toContract(current);
  return changes.map((c) => {
    const out: DriftChange = { path: c.path, kind: c.kind, severity: c.severity, message: c.message };
    if (c.before !== undefined) out.before = c.before;
    if (c.after !== undefined) out.after = c.after;
    const b = trimNode(nodeAt(before, c.path));
    const a = trimNode(nodeAt(after, c.path));
    if (b) out.beforeNode = b;
    if (a) out.afterNode = a;
    return out;
  });
}

/** Highest severity in a list of changes (undefined when empty). */
export function maxSeverity(changes: Array<{ severity: Severity }>): Severity | undefined {
  let best: Severity | undefined;
  for (const c of changes) if (!best || SEVERITY_RANK[c.severity] > SEVERITY_RANK[best]) best = c.severity;
  return best;
}

/** Compact description of a shape, e.g. `string<date-time> | null`. */
export function describeShape(shape: Shape): string {
  return describe(shape);
}

// ---------------------------------------------------------------------------
// Contract helpers (engine independent)
// ---------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** api-drift path syntax: `$.a`, `$["odd key"]`, `$.list[]`, `$.map.*` */
export function childPath(path: string, key: string): string {
  return IDENT.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

const PATH_TOKEN = /\.([A-Za-z_$][\w$]*|\*)|\[\]|\[("(?:[^"\\]|\\.)*")\]/g;

/** Finds the contract node at an api-drift path (undefined when absent). */
export function nodeAt(root: ContractNode | undefined, path: string): ContractNode | undefined {
  if (!root || !path.startsWith('$')) return undefined;
  let node: ContractNode | undefined = root;
  const rest = path.slice(1);
  let consumed = 0;
  for (const m of rest.matchAll(PATH_TOKEN)) {
    if (m.index !== consumed || !node) return undefined;
    consumed += m[0].length;
    const objectOf = (n: ContractNode) => (n.type === 'union' ? n.anyOf?.find((v) => v.type === 'object') : n.type === 'object' ? n : undefined);
    const arrayOf = (n: ContractNode) => (n.type === 'union' ? n.anyOf?.find((v) => v.type === 'array') : n.type === 'array' ? n : undefined);
    if (m[0] === '[]') node = arrayOf(node)?.items;
    else {
      const key = m[1] === '*' ? DYNAMIC_KEY : (m[1] ?? (JSON.parse(m[2]) as string));
      node = objectOf(node)?.properties?.[key];
    }
  }
  return consumed === rest.length ? node : undefined;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

/** 64-bit string hash (two 32-bit lanes), hex. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Stable fingerprint of a contract's structure (types, formats, optional/nullable markers). */
export function fingerprint(contract: ContractNode): string {
  return hashString(canonical(contract));
}

/** Counts property and item positions in a contract (the "fields" stat). */
export function countFields(node: ContractNode): number {
  let n = 0;
  if (node.properties) for (const child of Object.values(node.properties)) n += 1 + countFields(child);
  if (node.items) n += countFields(node.items);
  if (node.anyOf) for (const v of node.anyOf) n += countFields(v);
  return n;
}

function wrapUnion(text: string): string {
  return text.includes(' | ') ? `(${text})` : text;
}

/** Compact one-line type text, e.g. `string<date-time> | null`, `{ id, name, +3 }[]`. */
export function typeText(node: ContractNode | undefined, depth = 0): string {
  if (!node) return 'missing';
  let base: string;
  switch (node.type) {
    case 'string':
      base = node.enum ? node.enum.map((v) => JSON.stringify(v)).join(' | ') : node.format ? `string<${node.format}>` : 'string';
      break;
    case 'array':
      base = node.items ? `${wrapUnion(typeText(node.items, depth + 1))}[]` : 'unknown[]';
      break;
    case 'object': {
      const keys = Object.keys(node.properties ?? {});
      if (keys.length === 0) base = '{}';
      else if (depth >= 1) base = `{ ${keys.length} field${keys.length === 1 ? '' : 's'} }`;
      else {
        const shown = keys.slice(0, 4).map((k) => `${k}${node.properties![k].optional ? '?' : ''}`);
        base = `{ ${shown.join(', ')}${keys.length > 4 ? `, +${keys.length - 4}` : ''} }`;
      }
      break;
    }
    case 'union':
      base = (node.anyOf ?? []).map((v) => typeText(v, depth + 1)).join(' | ');
      break;
    default:
      base = node.type;
  }
  return node.nullable && node.type !== 'null' ? `${base} | null` : base;
}

/** Trims a contract fragment for storage next to a change (keeps 2 levels). */
export function trimNode(node: ContractNode | undefined, depth = 2): ContractNode | undefined {
  if (!node) return undefined;
  const out: ContractNode = { ...node };
  if (node.properties) {
    out.properties = {};
    if (depth > 0) for (const k of Object.keys(node.properties).slice(0, 40)) out.properties[k] = trimNode(node.properties[k], depth - 1)!;
  }
  if (node.items) out.items = depth <= 0 ? { type: node.items.type } : trimNode(node.items, depth - 1);
  if (node.anyOf) out.anyOf = node.anyOf.map((v) => trimNode(v, depth - 1)!);
  return out;
}

// ---------------------------------------------------------------------------
// Type generation
// ---------------------------------------------------------------------------

function isEngineShape(value: unknown): value is Shape {
  return !!value && typeof value === 'object' && 'kind' in (value as object);
}

function pascal(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''));
  const out = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /^[A-Za-z_]/.test(out) ? out || 'Response' : `T${out}`;
}

const HEADER = '// Generated by Driftwatch with api-drift from observed responses (shapes only, never values).';

/** TypeScript declarations (api-drift typegen; a structural fallback for bare contracts). */
export function toTypeScript(input: Shape | ContractNode, name = 'Response'): string {
  const typeName = pascal(name);
  if (isEngineShape(input)) return `${HEADER}\n${shapeToSource(input, typeName)}\n`;
  return `${HEADER}\n${contractToSource(input, typeName, false)}\n`;
}

/** Zod schemas as source text (zod is not a dependency of Driftwatch). */
export function toZod(input: Shape | ContractNode, name = 'Response'): string {
  const typeName = pascal(name);
  const body = isEngineShape(input) ? shapeToSource(input, typeName, { zod: true }) : contractToSource(input, typeName, true);
  return `import { z } from 'zod';\n\n${HEADER}\n${body}\n`;
}

function isMapNode(node: ContractNode): boolean {
  const keys = Object.keys(node.properties ?? {});
  return keys.length === 1 && /^<[\w -]+>$/.test(keys[0]);
}

const propName = (key: string) => (IDENT.test(key) ? key : JSON.stringify(key));

/** Structural generator used when only a stored contract (no engine shape) is available. */
function contractToSource(node: ContractNode, name: string, zod: boolean): string {
  const expr = (n: ContractNode, indent: string): string => {
    let base: string;
    switch (n.type) {
      case 'string':
        base = zod ? (n.enum?.length ? `z.enum([${n.enum.map((v) => JSON.stringify(v)).join(', ')}])` : 'z.string()') : n.enum ? n.enum.map((v) => JSON.stringify(v)).join(' | ') : 'string';
        break;
      case 'integer':
        base = zod ? 'z.number().int()' : 'number';
        break;
      case 'number':
        base = zod ? 'z.number()' : 'number';
        break;
      case 'boolean':
        base = zod ? 'z.boolean()' : 'boolean';
        break;
      case 'null':
        return zod ? 'z.null()' : 'null';
      case 'unknown':
        base = zod ? 'z.unknown()' : 'unknown';
        break;
      case 'array':
        base = zod ? `z.array(${n.items ? expr(n.items, indent) : 'z.unknown()'})` : `Array<${n.items ? expr(n.items, indent) : 'unknown'}>`;
        break;
      case 'union':
        base = zod ? `z.union([${(n.anyOf ?? []).map((v) => expr(v, indent)).join(', ')}])` : (n.anyOf ?? []).map((v) => expr(v, indent)).join(' | ');
        break;
      case 'object': {
        const props = n.properties ?? {};
        const keys = Object.keys(props);
        if (keys.length === 0) base = zod ? 'z.record(z.string(), z.unknown())' : 'Record<string, unknown>';
        else if (isMapNode(n)) base = zod ? `z.record(z.string(), ${expr(props[keys[0]], indent)})` : `Record<string, ${expr(props[keys[0]], indent)}>`;
        else {
          const inner = `${indent}  `;
          const lines = keys.map((k) =>
            zod
              ? `${inner}${propName(k)}: ${expr(props[k], inner)}${props[k].optional ? '.optional()' : ''},`
              : `${inner}${propName(k)}${props[k].optional ? '?' : ''}: ${expr(props[k], inner)};`,
          );
          base = zod ? `z.object({\n${lines.join('\n')}\n${indent}})` : `{\n${lines.join('\n')}\n${indent}}`;
        }
        break;
      }
    }
    return n.nullable ? (zod ? `${base}.nullable()` : `${base} | null`) : base;
  };
  return zod ? `export const ${name} = ${expr(node, '')};\nexport type ${name} = z.infer<typeof ${name}>;` : `export type ${name} = ${expr(node, '')};`;
}

// ---------------------------------------------------------------------------
// Endpoint keys + HAR import
// ---------------------------------------------------------------------------

/** `METHOD host /templated/path 2xx` (ids in paths become `:id`). */
export function endpointKey(method: string, url: string, status = 200): string {
  return engineEndpointKey({ method, url, status });
}

export interface HarEndpoint {
  key: string;
  method: string;
  host: string;
  path: string;
  status: string;
  samples: number;
  exampleUrl: string;
  shape: Shape;
  contract: ContractNode;
}

export interface HarImport {
  endpoints: HarEndpoint[];
  totalEntries: number;
  skipped: number;
  warnings: string[];
}

const SKIP_LABEL: Record<string, string> = {
  'not-json': 'not JSON',
  'no-body': 'no body saved (export "with content")',
  'too-large': 'too large',
  'invalid-json': 'invalid JSON',
  'no-response': 'no response',
  filtered: 'filtered',
};

/** Builds contracts from a HAR export with api-drift: JSON responses grouped by endpoint key and merged. */
export function importHar(har: unknown): HarImport {
  const result = engineImportHar(har as Parameters<typeof engineImportHar>[0], { enums: false, maxPayloadBytes: MAX_PAYLOAD_BYTES });
  const endpoints: HarEndpoint[] = Object.entries(result.baseline.endpoints).map(([key, entry]) => {
    const p = parseEndpointKey(key);
    let host = p?.host ?? '';
    let path = p?.path ?? key;
    if (!p && entry.example) {
      try {
        const u = new URL(entry.example);
        host = u.host;
        path = u.pathname;
      } catch {
        /* keep the key */
      }
    }
    return {
      key,
      method: p?.method ?? 'GET',
      host,
      path,
      status: p?.status ?? '',
      samples: entry.samples,
      exampleUrl: entry.example ?? '',
      shape: entry.shape,
      contract: toContract(entry.shape),
    };
  });
  endpoints.sort((a, b) => a.host.localeCompare(b.host) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const warnings = Object.entries(result.stats.reasons)
    .filter(([reason]) => reason !== 'not-json')
    .map(([reason, n]) => `${n} entr${n === 1 ? 'y' : 'ies'} skipped: ${SKIP_LABEL[reason] ?? reason}`);
  return { endpoints, totalEntries: result.stats.entries, skipped: result.stats.skipped, warnings };
}
