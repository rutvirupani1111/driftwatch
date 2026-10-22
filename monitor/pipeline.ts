/**
 * The monitor pipeline. For every configured API:
 *
 *   probe ─► normalise ─► infer shape ─► merge with learned baseline
 *         └► fingerprint changed? ─► diff(baseline, observed) ─► change event
 *
 * then history, stats, weather, index, changelog, Atom feeds, badges, alerts.
 *
 * Everything external is injected (fetch, clocks, env, directories) so the
 * whole pipeline runs offline in tests.
 */

import { join } from 'node:path';
import {
  ENGINE,
  countFields,
  diff,
  fingerprint,
  infer,
  maxSeverity,
  merge,
  restoreShape,
  toContract,
  type ContractNode,
  type DriftChange,
  type Severity,
  type Shape,
} from '../src/lib/drift';
import { normalizePayload } from '../src/lib/normalize';
import type { ApiLatest, ApiSummary, ChangeEvent, ChangeEventSummary, ChangesFile, HistoryLine, IndexFile } from '../src/lib/types';
import { CONDITIONS, classifyWeather, type Condition } from '../src/lib/weather';
import { sendAlerts, type AlertResult } from './alerts';
import { badgeState, renderBadge } from './badge';
import { resolveRequest, type MonitorConfig, type ResolvedConfig } from './config';
import { atomFeed } from './feed';
import { probe, type FetchLike, type ProbeResult } from './fetcher';
import { compactHistory } from './history';
import { climateRow, climateStart, computeStats, sparkline } from './stats';
import { loadApiState, saveApiState, writeFileAtomic, writeJson } from './store';

const DAY = 86_400_000;
const MAX_EVENTS_PER_API = 500;
const MAX_GLOBAL_EVENTS = 400;
const CLIMATE_DAYS = 30;

export interface RunOptions {
  config: ResolvedConfig;
  dataDir: string;
  publicDir: string;
  fetch: FetchLike;
  env?: Record<string, string | undefined>;
  /** wall clock, ms since epoch */
  now?: () => number;
  /** monotonic clock for latency, ms */
  clock?: () => number;
  /** only check these ids (others keep their stored state) */
  only?: string[];
  /** reset the learned baseline for these ids (or all) */
  rebaseline?: string[] | 'all';
  /** post webhooks for breaking/risky changes when configured (default true) */
  alerts?: boolean;
  log?: (message: string) => void;
}

export interface ApiRunResult {
  id: string;
  name: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  condition: Condition;
  event?: ChangeEvent;
  isNew: boolean;
  statusChanged: boolean;
  fingerprintChanged: boolean;
  rebaselined: boolean;
  warnings: string[];
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: ApiRunResult[];
  events: ChangeEvent[];
  /** something worth committing: a new API, a status flip or a contract change */
  changed: boolean;
  index: IndexFile;
  alerts: AlertResult[];
}

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/\$\{[^}]+\}/g, 'x')).host;
  } catch {
    return url;
  }
}

function countBySeverity(changes: DriftChange[]): Record<Severity, number> {
  const out: Record<Severity, number> = { breaking: 0, risky: 0, info: 0 };
  for (const c of changes) out[c.severity]++;
  return out;
}

/** "$.license: field is missing (…); +2 more (1 breaking, 2 info)" */
export function summarizeChanges(changes: DriftChange[]): string {
  const counts = countBySeverity(changes);
  const parts = (['breaking', 'risky', 'info'] as Severity[]).filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  const first = changes[0];
  const head = first ? `${first.path}: ${first.message}` : 'Contract changed';
  const rest = changes.length > 1 ? `; +${changes.length - 1} more` : '';
  return `${head}${rest} (${parts.join(', ')})`;
}

function makeEvent(m: MonitorConfig, at: string, changes: DriftChange[], before: string, after: string): ChangeEvent {
  return {
    id: `${m.id}@${at}`,
    apiId: m.id,
    apiName: m.name,
    at,
    severity: maxSeverity(changes) ?? 'info',
    summary: summarizeChanges(changes),
    fingerprintBefore: before,
    fingerprintAfter: after,
    changes,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface LearnResult {
  shape?: Shape;
  contract?: ContractNode;
  fingerprint?: string;
  samples: number;
  contractSince?: string;
  event?: ChangeEvent;
}

/** Folds one observation into the learned baseline and reports drift. */
export function learn(
  m: MonitorConfig,
  baseline: { shape?: Shape; contract?: ContractNode; fingerprint?: string; samples: number; contractSince?: string },
  observed: unknown,
  at: string,
): LearnResult {
  const current = infer(normalizePayload(observed, { ignore: m.ignore }));
  if (!baseline.shape || !baseline.contract || !baseline.fingerprint) {
    const contract = toContract(current);
    return { shape: current, contract, fingerprint: fingerprint(contract), samples: 1, contractSince: at };
  }
  const merged = merge(baseline.shape, current);
  const mergedContract = toContract(merged);
  const mergedFp = fingerprint(mergedContract);
  if (mergedFp === baseline.fingerprint) {
    return {
      shape: merged,
      contract: mergedContract,
      fingerprint: mergedFp,
      samples: baseline.samples + 1,
      contractSince: baseline.contractSince,
    };
  }
  const changes = diff(baseline.shape, current);
  return {
    shape: merged,
    contract: mergedContract,
    fingerprint: mergedFp,
    samples: baseline.samples + 1,
    contractSince: at,
    event: changes.length ? makeEvent(m, at, changes, baseline.fingerprint, mergedFp) : undefined,
  };
}

async function checkApi(m: MonitorConfig, o: Required<Pick<RunOptions, 'config' | 'dataDir' | 'fetch' | 'env' | 'now' | 'clock'>> & { rebaseline: boolean; log: (s: string) => void }): Promise<{ result: ApiRunResult; latest: ApiLatest; history: HistoryLine[]; events: ChangeEvent[] }> {
  const state = loadApiState(o.dataDir, m.id);
  const prev = state.latest;
  const req = resolveRequest(m, o.env, o.config.userAgent);
  const nowMs = o.now();
  const checkedAt = new Date(Math.floor(nowMs / 1000) * 1000).toISOString();
  let res: ProbeResult;
  if (req.missing.length) {
    res = { ok: false, status: 0, latencyMs: 0, sizeBytes: 0, error: { code: 'config', message: `Missing secret ${req.missing.map((n) => `\${${n}}`).join(', ')}` } };
  } else {
    res = await probe(o.fetch, req, { timeoutMs: m.timeoutMs ?? o.config.timeoutMs, clock: o.clock });
  }

  const engineChanged = !!prev && prev.engine !== ENGINE;
  const storedShape = prev && !engineChanged && prev.shape !== undefined ? restoreShape(prev.shape) : null;
  const unreadable = !!prev && !engineChanged && prev.shape !== undefined && !storedShape;
  const rebaselined = !!prev && (engineChanged || unreadable || o.rebaseline);
  const keep = prev && !rebaselined && storedShape;
  let learned: LearnResult = {
    shape: keep ? storedShape : undefined,
    contract: keep ? prev.contract : undefined,
    fingerprint: keep ? prev.fingerprint : undefined,
    samples: keep ? prev.samples : 0,
    contractSince: keep ? prev.contractSince : undefined,
  };
  const warnings = [...req.warnings];
  if (engineChanged) warnings.push(`re-baselined: engine changed ${prev?.engine} → ${ENGINE}`);
  else if (unreadable) warnings.push('re-baselined: stored shape could not be read');
  else if (rebaselined) warnings.push('re-baselined on request');

  if (res.ok) {
    try {
      learned = learn(m, learned, res.json, checkedAt);
    } catch (err) {
      warnings.push(`inference failed: ${(err as Error).message}`);
    }
  }
  const event = learned.event;

  const line: HistoryLine = { t: checkedAt, ok: res.ok ? 1 : 0, s: res.status, ms: Math.round(res.latencyMs), b: res.sizeBytes };
  if (res.ok && learned.fingerprint) line.fp = learned.fingerprint;
  if (res.error) line.e = res.error.code;
  if (event) line.c = event.changes.length;
  const history = compactHistory([...state.history, line], nowMs);
  const events = event ? [...state.events, event].slice(-MAX_EVENTS_PER_API) : state.events;

  const lastEvent = events.at(-1);
  const weather = classifyWeather({
    now: nowMs,
    ok: res.ok,
    status: res.status,
    error: res.error,
    events,
    firstSeenAt: prev?.firstSeenAt ?? checkedAt,
  });

  const latest: ApiLatest = {
    id: m.id,
    name: m.name,
    category: m.category,
    url: m.url,
    host: hostOf(m.url),
    method: (m.method ?? 'GET').toUpperCase(),
    docs: m.docs,
    logo: m.logo,
    description: m.description,
    ignore: m.ignore,
    checkedAt,
    ok: res.ok,
    status: res.status,
    latencyMs: Math.round(res.latencyMs),
    sizeBytes: res.sizeBytes,
    contentType: res.contentType,
    error: res.error ?? null,
    engine: ENGINE,
    fingerprint: learned.fingerprint,
    contract: learned.contract,
    shape: learned.shape,
    fieldCount: learned.contract ? countFields(learned.contract) : 0,
    samples: learned.samples,
    firstSeenAt: prev?.firstSeenAt ?? checkedAt,
    contractSince: learned.contractSince,
    lastChange: lastEvent ? { id: lastEvent.id, at: lastEvent.at, severity: lastEvent.severity, summary: lastEvent.summary } : undefined,
    weather,
    stats: computeStats(history, nowMs),
  };

  const result: ApiRunResult = {
    id: m.id,
    name: m.name,
    ok: res.ok,
    status: res.status,
    latencyMs: Math.round(res.latencyMs),
    error: res.error?.message,
    condition: weather.condition,
    event,
    isNew: !prev,
    statusChanged: !!prev && (prev.ok !== res.ok || prev.status !== res.status),
    fingerprintChanged: (prev?.fingerprint ?? null) !== (learned.fingerprint ?? null),
    rebaselined,
    warnings,
  };
  return { result, latest, history, events };
}

function summaryRow(latest: ApiLatest, history: HistoryLine[], events: ChangeEvent[], now: number): ApiSummary {
  const in7 = events.filter((e) => now - Date.parse(e.at) <= 7 * DAY).length;
  const in30 = events.filter((e) => now - Date.parse(e.at) <= 30 * DAY).length;
  return {
    id: latest.id,
    name: latest.name,
    category: latest.category,
    host: latest.host,
    method: latest.method,
    docs: latest.docs,
    logo: latest.logo,
    description: latest.description,
    condition: latest.weather.condition,
    headline: latest.weather.headline,
    reason: latest.weather.reason,
    since: latest.weather.since,
    ok: latest.ok,
    status: latest.status,
    checkedAt: latest.checkedAt,
    latencyMs: latest.latencyMs,
    uptime7d: latest.stats.d7.uptime,
    uptime30d: latest.stats.d30.uptime,
    p50_7d: latest.stats.d7.p50,
    p95_7d: latest.stats.d7.p95,
    spark: sparkline(history, 24),
    lastChange: latest.lastChange,
    changes7d: in7,
    changes30d: in30,
    fieldCount: latest.fieldCount,
    fingerprint: latest.fingerprint,
  };
}

function eventSummary(e: ChangeEvent): ChangeEventSummary {
  const { changes, ...rest } = e;
  return { ...rest, counts: countBySeverity(changes) };
}

/** Runs every monitor once and regenerates all derived artefacts. */
export async function runMonitor(opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? (() => Date.now());
  const clock = opts.clock ?? (() => performance.now());
  const env = opts.env ?? {};
  const log = opts.log ?? (() => {});
  const startedMs = now();
  const { config } = opts;
  const selected = opts.only?.length ? config.monitors.filter((m) => opts.only!.includes(m.id)) : config.monitors;
  const rebaseline = (id: string) => opts.rebaseline === 'all' || (Array.isArray(opts.rebaseline) && opts.rebaseline.includes(id));

  const checked = await mapLimit(selected, config.concurrency, async (m) => {
    const out = await checkApi(m, { config, dataDir: opts.dataDir, fetch: opts.fetch, env, now, clock, rebaseline: rebaseline(m.id), log });
    saveApiState(opts.dataDir, m.id, out);
    const r = out.result;
    log(`${r.ok ? 'ok  ' : 'FAIL'} ${m.id.padEnd(22)} ${String(r.status).padStart(3)} ${String(r.latencyMs).padStart(5)} ms  ${r.condition}${r.event ? `  ${r.event.severity}: ${r.event.summary}` : ''}${r.error ? `  (${r.error})` : ''}`);
    for (const w of r.warnings) log(`     ${m.id}: ${w}`);
    return out;
  });

  // Rebuild derived artefacts from the stored state of every configured API.
  const nowMs = now();
  const generatedAt = new Date(nowMs).toISOString();
  const states = config.monitors
    .map((m) => {
      const fresh = checked.find((c) => c.result.id === m.id);
      if (fresh) return { m, latest: fresh.latest, history: fresh.history, events: fresh.events };
      const s = loadApiState(opts.dataDir, m.id);
      return s.latest ? { m, latest: s.latest, history: s.history, events: s.events } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const apis = states.map((s) => summaryRow(s.latest, s.history, s.events, nowMs));
  const counts = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  for (const a of apis) counts[a.condition]++;
  const allEvents = states.flatMap((s) => s.events).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.apiId.localeCompare(b.apiId)));
  const categories = [...new Set(config.monitors.map((m) => m.category))];

  const index: IndexFile = {
    version: 1,
    generatedAt,
    durationMs: nowMs - startedMs,
    engine: ENGINE,
    site: config.site,
    schedule: config.schedule,
    total: apis.length,
    counts,
    categories,
    apis,
    climate: {
      start: climateStart(nowMs, CLIMATE_DAYS),
      days: CLIMATE_DAYS,
      rows: Object.fromEntries(states.map((s) => [s.m.id, climateRow(s.history, s.events, nowMs, CLIMATE_DAYS)])),
    },
    recent: allEvents.slice(0, 12).map(eventSummary),
  };
  writeJson(join(opts.dataDir, 'index.json'), index);
  const changesFile: ChangesFile = { generatedAt, events: allEvents.slice(0, MAX_GLOBAL_EVENTS) };
  writeJson(join(opts.dataDir, 'changes.json'), changesFile);

  // Atom feeds: global + one per API.
  const site = config.site.url;
  const link = (e: ChangeEvent) => `${site}api/${e.apiId}#${encodeURIComponent(e.id)}`;
  writeFileAtomic(
    join(opts.publicDir, 'feed.xml'),
    atomFeed({
      id: `${site}feed.xml`,
      title: `${config.site.title}: API contract changes`,
      subtitle: config.site.description,
      selfUrl: `${site}feed.xml`,
      alternateUrl: `${site}changes`,
      generatedAt,
      events: allEvents.slice(0, 50),
      linkFor: link,
      generatorUri: `https://github.com/${config.site.repo}`,
    }),
  );
  for (const s of states) {
    writeFileAtomic(
      join(opts.publicDir, 'feeds', `${s.m.id}.xml`),
      atomFeed({
        id: `${site}feeds/${s.m.id}.xml`,
        title: `${s.m.name}: contract changes (${config.site.title})`,
        subtitle: `Shape changes observed in ${s.m.method ?? 'GET'} ${s.m.url}`,
        selfUrl: `${site}feeds/${s.m.id}.xml`,
        alternateUrl: `${site}api/${s.m.id}`,
        generatedAt,
        events: [...s.events].reverse().slice(0, 30),
        linkFor: link,
        generatorUri: `https://github.com/${config.site.repo}`,
      }),
    );
    writeFileAtomic(join(opts.publicDir, 'badges', `${s.m.id}.svg`), renderBadge(badgeState(s.latest, nowMs)));
  }

  const newEvents = checked.flatMap((c) => (c.result.event ? [c.result.event] : []));
  const alerts = opts.alerts === false ? [] : await sendAlerts(newEvents, { env, fetch: opts.fetch, siteUrl: site });
  for (const a of alerts) log(`alert ${a.target}: ${a.ok ? 'sent' : `failed (${a.status ?? a.error})`}`);

  const results = checked.map((c) => c.result);
  const finishedMs = now();
  return {
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - startedMs,
    results,
    events: newEvents,
    changed: results.some((r) => r.isNew || r.statusChanged || r.fingerprintChanged || !!r.event),
    index,
    alerts,
  };
}
