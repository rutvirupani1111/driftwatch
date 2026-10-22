import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Temp directories live inside the repo (.tmp is git-ignored). */
export function tempDir(prefix = 'test-'): { dir: string; cleanup: () => void } {
  const base = join(ROOT, '.tmp');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface FakeRoute {
  status?: number;
  body?: unknown;
  /** raw text body (overrides `body`) */
  text?: string;
  contentType?: string;
  /** never resolve until aborted */
  hang?: boolean;
  /** throw a network error */
  fail?: string;
}

export interface FakeCall {
  url: string;
  init: RequestInit;
}

/** A fake fetch whose responses can be swapped between runs. */
export function fakeFetch(routes: Record<string, FakeRoute>) {
  const calls: FakeCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (route.fail) throw Object.assign(new Error('fetch failed'), { cause: { code: route.fail } });
    if (route.hang) {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    const text = route.text ?? JSON.stringify(route.body);
    return new Response(route.status === 204 ? null : text, {
      status: route.status ?? 200,
      headers: { 'content-type': route.contentType ?? 'application/json' },
    });
  };
  return { fetch: fetchImpl, calls, routes };
}

/** A controllable wall clock. */
export function fakeClock(start = Date.parse('2026-10-01T00:17:00Z')) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (iso: string) => {
      t = Date.parse(iso);
    },
  };
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
