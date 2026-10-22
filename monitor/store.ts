import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ApiLatest, ChangeEvent, HistoryLine, IndexFile } from '../src/lib/types';
import { mergeHistories, parseHistory, serializeHistory } from './history';

export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function readJson<T>(path: string): T | null {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Atomic-ish write: write a temp file next to the target, then rename. */
export function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

export function writeJson(path: string, value: unknown, pretty = true): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
}

export interface ApiFiles {
  dir: string;
  latest: string;
  history: string;
  changes: string;
}

export function apiFiles(dataDir: string, id: string): ApiFiles {
  const dir = join(dataDir, 'apis', id);
  return { dir, latest: join(dir, 'latest.json'), history: join(dir, 'history.jsonl'), changes: join(dir, 'changes.json') };
}

export interface ApiState {
  latest: ApiLatest | null;
  history: HistoryLine[];
  events: ChangeEvent[];
}

export function loadApiState(dataDir: string, id: string): ApiState {
  const f = apiFiles(dataDir, id);
  return {
    latest: readJson<ApiLatest>(f.latest),
    history: parseHistory(readText(f.history)),
    events: readJson<ChangeEvent[]>(f.changes) ?? [],
  };
}

export function saveApiState(dataDir: string, id: string, state: { latest: ApiLatest; history: HistoryLine[]; events: ChangeEvent[] }): void {
  const f = apiFiles(dataDir, id);
  writeJson(f.latest, state.latest);
  writeFileAtomic(f.history, serializeHistory(state.history));
  writeJson(f.changes, state.events);
}

/**
 * Restores monitor state from a cache directory (GitHub Actions cache) when the
 * cache is newer than the committed data. Histories and change logs are merged
 * (union), so nothing recorded in either place is lost.
 */
export function restoreFromCache(cacheDir: string, dataDir: string, now: number): { restored: boolean; reason: string } {
  const cacheIndex = readJson<IndexFile>(join(cacheDir, 'index.json'));
  if (!cacheIndex) return { restored: false, reason: 'no cached state' };
  const dataIndex = readJson<IndexFile>(join(dataDir, 'index.json'));
  if (dataIndex && dataIndex.generatedAt >= cacheIndex.generatedAt) {
    return { restored: false, reason: `committed data (${dataIndex.generatedAt}) is as new as the cache (${cacheIndex.generatedAt})` };
  }
  const cacheApis = join(cacheDir, 'apis');
  if (existsSync(cacheApis)) {
    for (const id of readdirSync(cacheApis)) {
      if (!statSync(join(cacheApis, id)).isDirectory()) continue;
      const cached = loadApiState(cacheDir, id);
      const committed = loadApiState(dataDir, id);
      if (!cached.latest) continue;
      const latest = !committed.latest || committed.latest.checkedAt <= cached.latest.checkedAt ? cached.latest : committed.latest;
      const history = mergeHistories(committed.history, cached.history, now);
      const byId = new Map<string, ChangeEvent>();
      for (const e of [...committed.events, ...cached.events]) byId.set(e.id, e);
      const events = [...byId.values()].sort((a, b) => (a.at < b.at ? -1 : 1));
      saveApiState(dataDir, id, { latest, history, events });
    }
  }
  cpSync(join(cacheDir, 'index.json'), join(dataDir, 'index.json'));
  return { restored: true, reason: `cache from ${cacheIndex.generatedAt} is newer than committed data` };
}

export function removeDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
