import type { ApiError } from '../src/lib/types';
import type { ResolvedRequest } from './config';

/** The subset of `fetch` the monitor needs. Tests inject a fake. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ProbeResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  sizeBytes: number;
  contentType?: string;
  error?: ApiError;
  /** parsed body, only when ok */
  json?: unknown;
}

export interface ProbeOptions {
  timeoutMs: number;
  /** bodies larger than this are rejected (default 5 MB) */
  maxBytes?: number;
  /** monotonic clock in ms used for latency (default performance.now) */
  clock?: () => number;
}

function describeNetworkError(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code;
  if (code === 'ENOTFOUND') return 'DNS lookup failed';
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ECONNRESET') return 'Connection reset';
  if (code === 'CERT_HAS_EXPIRED' || code?.startsWith('ERR_TLS') || code?.includes('CERT')) return `TLS error (${code})`;
  return e?.cause?.message || e?.message || 'Network error';
}

/** Calls one endpoint once and classifies the outcome. Never throws. */
export async function probe(fetchImpl: FetchLike, req: ResolvedRequest, options: ProbeOptions): Promise<ProbeResult> {
  const clock = options.clock ?? (() => performance.now());
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const started = clock();
  try {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const buf = await res.arrayBuffer();
    const latencyMs = Math.max(0, clock() - started);
    const sizeBytes = buf.byteLength;
    const contentType = res.headers.get('content-type') ?? undefined;
    const base = { status: res.status, latencyMs, sizeBytes, contentType };
    if (res.status < 200 || res.status >= 300) {
      const reason = res.statusText ? ` ${res.statusText}` : '';
      return { ...base, ok: false, error: { code: `http_${res.status}`, message: `HTTP ${res.status}${reason}` } };
    }
    if (sizeBytes > maxBytes) {
      return { ...base, ok: false, error: { code: 'too_large', message: `Body is ${Math.round(sizeBytes / 1024)} KB (limit ${Math.round(maxBytes / 1024)} KB)` } };
    }
    const text = new TextDecoder().decode(buf);
    if (!text.trim()) {
      return { ...base, ok: false, error: { code: 'empty_body', message: `HTTP ${res.status} with an empty body` } };
    }
    try {
      const json: unknown = JSON.parse(text);
      return { ...base, ok: true, json };
    } catch {
      const isJsonType = !!contentType && /json/i.test(contentType);
      return {
        ...base,
        ok: false,
        error: isJsonType
          ? { code: 'invalid_json', message: 'Response claimed JSON but did not parse' }
          : { code: 'not_json', message: `Expected JSON, got ${contentType?.split(';')[0] ?? 'an unknown content type'}` },
      };
    }
  } catch (err) {
    const latencyMs = Math.max(0, clock() - started);
    if (timedOut) {
      return { ok: false, status: 0, latencyMs, sizeBytes: 0, error: { code: 'timeout', message: `Timed out after ${Math.round(options.timeoutMs / 1000)} s` } };
    }
    return { ok: false, status: 0, latencyMs, sizeBytes: 0, error: { code: 'network', message: describeNetworkError(err) } };
  } finally {
    clearTimeout(timer);
  }
}
