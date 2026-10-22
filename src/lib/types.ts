/**
 * Shapes of the files Driftwatch writes to `data/` and the site reads back.
 * Shared by the monitor (writer) and the site (reader).
 */

import type { ContractNode, DriftChange, Severity } from './drift';
import type { Condition, Weather } from './weather';

export interface SiteInfo {
  title: string;
  description: string;
  /** public URL of the dashboard, with trailing slash */
  url: string;
  /** owner/repo on GitHub */
  repo: string;
}

/** One line of `data/apis/<id>/history.jsonl` (compact keys keep the file small). */
export interface HistoryLine {
  /** ISO timestamp of the check */
  t: string;
  /** 1 when the check succeeded (2xx + JSON) */
  ok: 0 | 1;
  /** HTTP status, 0 when no response */
  s: number;
  /** latency in ms (full body) */
  ms: number;
  /** body size in bytes */
  b: number;
  /** contract fingerprint after this check */
  fp?: string;
  /** error code when ok = 0 (timeout, network, http_503, invalid_json, not_json, too_large, config) */
  e?: string;
  /** number of contract changes detected by this check */
  c?: number;
}

export interface ChangeEvent {
  /** stable id: `<apiId>@<iso time>` */
  id: string;
  apiId: string;
  apiName: string;
  at: string;
  severity: Severity;
  summary: string;
  fingerprintBefore: string;
  fingerprintAfter: string;
  changes: DriftChange[];
}

export type ChangeEventSummary = Omit<ChangeEvent, 'changes'> & { counts: Record<Severity, number> };

export interface WindowStats {
  checks: number;
  ok: number;
  /** 0..1, null without checks */
  uptime: number | null;
  /** latency percentiles (ms) over successful checks */
  p50: number | null;
  p95: number | null;
}

export interface ApiStats {
  d1: WindowStats;
  d7: WindowStats;
  d30: WindowStats;
}

export interface ApiError {
  code: string;
  message: string;
}

/** `data/apis/<id>/latest.json` */
export interface ApiLatest {
  id: string;
  name: string;
  category: string;
  /** URL as written in the config: `${SECRET}` placeholders are never resolved here */
  url: string;
  host: string;
  method: string;
  docs: string;
  logo?: string;
  description?: string;
  ignore?: string[];

  checkedAt: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  sizeBytes: number;
  contentType?: string;
  error?: ApiError | null;

  /** engine that produced `shape`; a different engine triggers a re-baseline */
  engine: string;
  fingerprint?: string;
  contract?: ContractNode;
  /** opaque engine shape with observation counts (the learned baseline) */
  shape?: unknown;
  fieldCount: number;
  samples: number;
  firstSeenAt: string;
  /** when the current fingerprint was first observed */
  contractSince?: string;
  lastChange?: Pick<ChangeEvent, 'id' | 'at' | 'severity' | 'summary'>;

  weather: Weather;
  stats: ApiStats;
}

/** Row in `data/index.json` */
export interface ApiSummary {
  id: string;
  name: string;
  category: string;
  host: string;
  method: string;
  docs: string;
  logo?: string;
  description?: string;
  condition: Condition;
  headline: string;
  reason: string;
  since?: string;
  ok: boolean;
  status: number;
  checkedAt: string;
  latencyMs: number;
  uptime7d: number | null;
  uptime30d: number | null;
  p50_7d: number | null;
  p95_7d: number | null;
  /** latest latencies, oldest first; null = failed check */
  spark: Array<number | null>;
  lastChange?: Pick<ChangeEvent, 'id' | 'at' | 'severity' | 'summary'>;
  changes7d: number;
  changes30d: number;
  fieldCount: number;
  fingerprint?: string;
}

/**
 * Climate heatmap rows: one character per UTC day, oldest first.
 *   '.' no data   'c' clear   'i' info   'r' risky   'f' fog (failed checks)   'b' breaking
 */
export type ClimateCode = '.' | 'c' | 'i' | 'r' | 'f' | 'b';

export interface Climate {
  /** first day (YYYY-MM-DD, UTC) */
  start: string;
  days: number;
  rows: Record<string, string>;
}

/** `data/index.json`: everything the Forecast page needs in one request. */
export interface IndexFile {
  version: 1;
  generatedAt: string;
  durationMs: number;
  engine: string;
  site: SiteInfo;
  /** cron expression of the monitor workflow, for "next update" hints */
  schedule: string;
  total: number;
  counts: Record<Condition, number>;
  categories: string[];
  apis: ApiSummary[];
  climate: Climate;
  recent: ChangeEventSummary[];
}

/** `data/changes.json`: global changelog across APIs (newest first). */
export interface ChangesFile {
  generatedAt: string;
  events: ChangeEvent[];
}
