import type { HistoryLine } from '../src/lib/types';

/** History older than this is dropped on every run. */
export const RETENTION_DAYS = 120;
const DAY = 86_400_000;

/** Parses `history.jsonl`, skipping blank or corrupt lines. */
export function parseHistory(text: string | null | undefined): HistoryLine[] {
  if (!text) return [];
  const out: HistoryLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const v = JSON.parse(line) as HistoryLine;
      if (v && typeof v.t === 'string' && !Number.isNaN(Date.parse(v.t))) out.push(v);
    } catch {
      /* skip a corrupt line rather than losing the whole file */
    }
  }
  return out;
}

export function serializeHistory(lines: HistoryLine[]): string {
  return lines.length ? `${lines.map((l) => JSON.stringify(l)).join('\n')}\n` : '';
}

/**
 * Keeps the last `retentionDays` of history, sorted oldest first, one line per
 * timestamp (the later write wins). Idempotent.
 */
export function compactHistory(lines: HistoryLine[], now: number, retentionDays = RETENTION_DAYS): HistoryLine[] {
  const cutoff = now - retentionDays * DAY;
  const byTime = new Map<string, HistoryLine>();
  for (const l of lines) {
    const t = Date.parse(l.t);
    if (Number.isNaN(t) || t < cutoff) continue;
    byTime.set(new Date(t).toISOString(), l);
  }
  return [...byTime.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, l]) => l);
}

/** Union of two histories (used when restoring a cached state). */
export function mergeHistories(a: HistoryLine[], b: HistoryLine[], now: number): HistoryLine[] {
  return compactHistory([...a, ...b], now);
}
