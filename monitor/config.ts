import { readFileSync } from 'node:fs';
import { DEFAULT_USER_AGENT, substitute, validateConfig, type MonitorConfig, type ResolvedConfig } from '../src/lib/config';

// The config model and validator are shared with the site (config builder).
export {
  DEFAULT_SCHEDULE,
  DEFAULT_SITE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  referencedSecrets,
  substitute,
  validateConfig,
} from '../src/lib/config';
export type { DriftwatchConfig, MonitorConfig, ResolvedConfig } from '../src/lib/config';

export function loadConfig(path: string, env: Record<string, string | undefined> = {}): ResolvedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
  const { config, errors } = validateConfig(raw, env);
  if (errors.length) throw new Error(`Invalid config ${path}:\n  - ${errors.join('\n  - ')}`);
  return config;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function substituteDeep(value: unknown, env: Record<string, string | undefined>, missing: string[]): unknown {
  if (typeof value === 'string') {
    const r = substitute(value, env);
    missing.push(...r.missing);
    return r.value;
  }
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, env, missing));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteDeep(v, env, missing)]));
  return value;
}

export interface ResolvedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  /** secrets referenced by the URL or body that are not set (the check cannot run) */
  missing: string[];
  /** non-fatal notes, e.g. a header dropped because its secret is not set */
  warnings: string[];
}

/** Builds the concrete request for a monitor. Secrets only ever live in this object. */
export function resolveRequest(m: MonitorConfig, env: Record<string, string | undefined>, userAgent = DEFAULT_USER_AGENT): ResolvedRequest {
  const missing: string[] = [];
  const warnings: string[] = [];
  const url = substitute(m.url, env);
  missing.push(...url.missing);
  const headers: Record<string, string> = { 'User-Agent': userAgent, Accept: 'application/json' };
  for (const [name, raw] of Object.entries(m.headers ?? {})) {
    const r = substitute(raw, env);
    if (r.missing.length) {
      warnings.push(`header ${name} skipped: ${r.missing.map((n) => `\${${n}}`).join(', ')} not set`);
      continue;
    }
    headers[name] = r.value;
  }
  let body: string | undefined;
  if (m.body !== undefined && m.body !== null) {
    const bodyMissing: string[] = [];
    const resolved = substituteDeep(m.body, env, bodyMissing);
    missing.push(...bodyMissing);
    body = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  }
  return { url: url.value, method: (m.method ?? 'GET').toUpperCase(), headers, body, missing: [...new Set(missing)], warnings };
}
