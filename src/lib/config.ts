/**
 * driftwatch.config.json: types and validation. Browser-safe, so the
 * "Watch your own" config builder validates exactly like the monitor does.
 */

import { parsePath } from './normalize';
import type { SiteInfo } from './types';

export const DEFAULT_USER_AGENT = 'Driftwatch (+https://github.com/rutvirupani1111/driftwatch)';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_SCHEDULE = '17 */3 * * *';
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const VAR = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export interface MonitorConfig {
  id: string;
  name: string;
  category: string;
  url: string;
  method?: string;
  /** values may reference `${SECRET_NAME}` environment variables */
  headers?: Record<string, string>;
  /** JSON body (objects are serialised); strings may reference `${SECRET_NAME}` */
  body?: unknown;
  docs: string;
  logo?: string;
  description?: string;
  /** JSONPath-lite paths excluded from the contract, e.g. `$.releases` */
  ignore?: string[];
  timeoutMs?: number;
}

export interface DriftwatchConfig {
  $schema?: string;
  site?: Partial<SiteInfo>;
  schedule?: string;
  userAgent?: string;
  timeoutMs?: number;
  concurrency?: number;
  monitors: MonitorConfig[];
}

export interface ResolvedConfig {
  site: SiteInfo;
  schedule: string;
  userAgent: string;
  timeoutMs: number;
  concurrency: number;
  monitors: MonitorConfig[];
}

export const DEFAULT_SITE: SiteInfo = {
  title: 'Driftwatch',
  description: 'The weather report for the APIs the internet runs on.',
  url: 'https://rutvirupani1111.github.io/driftwatch/',
  repo: 'rutvirupani1111/driftwatch',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text.replace(VAR, 'x'));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Validates a parsed config file. Returns the resolved config plus human-readable errors. */
export function validateConfig(raw: unknown, env: Record<string, string | undefined> = {}): { config: ResolvedConfig; errors: string[] } {
  const errors: string[] = [];
  const obj: Partial<DriftwatchConfig> = Array.isArray(raw) ? { monitors: raw as MonitorConfig[] } : isRecord(raw) ? (raw as Partial<DriftwatchConfig>) : {};
  if (!Array.isArray(obj.monitors)) errors.push('`monitors` must be an array');
  const monitors: MonitorConfig[] = [];
  const seen = new Set<string>();
  (Array.isArray(obj.monitors) ? obj.monitors : []).forEach((m, i) => {
    const where = `monitors[${i}]${isRecord(m) && typeof m.id === 'string' && m.id ? ` (${m.id})` : ''}`;
    if (!isRecord(m)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const mm = m as unknown as MonitorConfig;
    if (typeof mm.id !== 'string' || !ID_PATTERN.test(mm.id)) errors.push(`${where}: \`id\` must be a lowercase slug (a-z, 0-9, -)`);
    else if (seen.has(mm.id)) errors.push(`${where}: duplicate id`);
    else seen.add(mm.id);
    if (typeof mm.name !== 'string' || !mm.name.trim()) errors.push(`${where}: \`name\` is required`);
    if (typeof mm.category !== 'string' || !mm.category.trim()) errors.push(`${where}: \`category\` is required`);
    if (typeof mm.url !== 'string' || !isHttpUrl(mm.url)) errors.push(`${where}: \`url\` must be an http(s) URL`);
    if (typeof mm.docs !== 'string' || !isHttpUrl(mm.docs)) errors.push(`${where}: \`docs\` must be an http(s) URL`);
    if (mm.method !== undefined && (typeof mm.method !== 'string' || !METHODS.includes(mm.method.toUpperCase()))) {
      errors.push(`${where}: \`method\` must be one of ${METHODS.join(', ')}`);
    }
    if (mm.headers !== undefined) {
      if (!isRecord(mm.headers) || Object.values(mm.headers).some((v) => typeof v !== 'string')) {
        errors.push(`${where}: \`headers\` must map header names to strings`);
      }
    }
    if (mm.ignore !== undefined) {
      if (!Array.isArray(mm.ignore)) errors.push(`${where}: \`ignore\` must be an array of paths`);
      else
        for (const p of mm.ignore) {
          try {
            parsePath(String(p));
          } catch (err) {
            errors.push(`${where}: ${(err as Error).message}`);
          }
        }
    }
    if (mm.timeoutMs !== undefined && (typeof mm.timeoutMs !== 'number' || mm.timeoutMs < 1000 || mm.timeoutMs > 60_000)) {
      errors.push(`${where}: \`timeoutMs\` must be between 1000 and 60000`);
    }
    monitors.push({ ...mm, method: (typeof mm.method === 'string' ? mm.method : 'GET').toUpperCase() });
  });

  const siteUrl = env.SITE_URL || obj.site?.url || DEFAULT_SITE.url;
  const site: SiteInfo = {
    title: obj.site?.title || DEFAULT_SITE.title,
    description: obj.site?.description || DEFAULT_SITE.description,
    url: siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
    repo: env.GITHUB_REPOSITORY || obj.site?.repo || DEFAULT_SITE.repo,
  };
  return {
    config: {
      site,
      schedule: obj.schedule || DEFAULT_SCHEDULE,
      userAgent: obj.userAgent || DEFAULT_USER_AGENT,
      timeoutMs: obj.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      concurrency: Math.max(1, Math.min(10, obj.concurrency ?? 4)),
      monitors,
    },
    errors,
  };
}

/** Replaces `${NAME}` with env values; reports the names that were missing. */
export function substitute(text: string, env: Record<string, string | undefined>): { value: string; missing: string[] } {
  const missing: string[] = [];
  const value = text.replace(VAR, (_, name: string) => {
    const v = env[name];
    if (v === undefined || v === '') {
      missing.push(name);
      return '';
    }
    return v;
  });
  return { value, missing };
}

/** Every `${NAME}` referenced anywhere in the monitors (for docs and the config builder). */
export function referencedSecrets(monitors: Array<Partial<MonitorConfig>>): string[] {
  const names = new Set<string>();
  const scan = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(VAR)) names.add(m[1]);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (isRecord(v)) Object.values(v).forEach(scan);
  };
  for (const m of monitors) {
    scan(m.url);
    scan(m.headers);
    scan(m.body);
  }
  return [...names].sort();
}

/** "GitHub REST: repo" → "github-rest-repo" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}
