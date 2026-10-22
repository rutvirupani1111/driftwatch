import { useEffect, useState } from 'react';
import type { ApiLatest, ChangeEvent, ChangesFile, HistoryLine, IndexFile } from './types';

/** Site-relative URL (works under the GitHub Pages base path). */
export function siteUrl(path = ''): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

export function dataUrl(path: string): string {
  return siteUrl(`data/${path}`);
}

/** Absolute URL for embeds (badges, feeds), preferring the configured public URL. */
export function publicUrl(index: IndexFile | undefined, path: string): string {
  const base = index?.site.url ?? new URL(siteUrl(), window.location.origin).toString();
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string, kind: 'json' | 'text'): Promise<T> {
  const key = `${kind}:${path}`;
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetch(dataUrl(path), { cache: 'no-cache' }).then((r) => {
      // Static hosts answer unknown paths with an HTML page (Pages 404.html, SPA fallbacks).
      const html = (r.headers.get('content-type') ?? '').includes('text/html');
      if (r.status === 404 || html) throw new Error('not-found');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (kind === 'json' ? r.json() : r.text()) as Promise<T>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string };

function useLoad<T>(path: string | null, kind: 'json' | 'text'): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ status: 'loading' });
    load<T>(path, kind).then(
      (data) => alive && setState({ status: 'ready', data }),
      (err: Error) => alive && setState({ status: 'error', error: err.message }),
    );
    return () => {
      alive = false;
    };
  }, [path, kind]);
  return state;
}

export const useIndex = () => useLoad<IndexFile>('index.json', 'json');
export const useGlobalChanges = () => useLoad<ChangesFile>('changes.json', 'json');
export const useApiLatest = (id: string) => useLoad<ApiLatest>(`apis/${id}/latest.json`, 'json');
export const useApiChanges = (id: string) => useLoad<ChangeEvent[]>(`apis/${id}/changes.json`, 'json');

export function useApiHistory(id: string): Loadable<HistoryLine[]> {
  const raw = useLoad<string>(`apis/${id}/history.jsonl`, 'text');
  if (raw.status !== 'ready') return raw;
  return { status: 'ready', data: parseHistoryText(raw.data) };
}

export function parseHistoryText(text: string): HistoryLine[] {
  const out: HistoryLine[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as HistoryLine);
    } catch {
      /* skip */
    }
  }
  return out;
}
