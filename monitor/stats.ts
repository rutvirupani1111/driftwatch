import type { ApiStats, ChangeEvent, ClimateCode, HistoryLine, WindowStats } from '../src/lib/types';

const DAY = 86_400_000;

/** Nearest-rank percentile over an ascending array. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function windowStats(lines: HistoryLine[], now: number, days: number): WindowStats {
  const cutoff = now - days * DAY;
  const inWindow = lines.filter((l) => {
    const t = Date.parse(l.t);
    return t >= cutoff && t <= now + 60_000;
  });
  const okLines = inWindow.filter((l) => l.ok === 1);
  const latencies = okLines.map((l) => l.ms).sort((a, b) => a - b);
  return {
    checks: inWindow.length,
    ok: okLines.length,
    uptime: inWindow.length ? okLines.length / inWindow.length : null,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
  };
}

export function computeStats(lines: HistoryLine[], now: number): ApiStats {
  return { d1: windowStats(lines, now, 1), d7: windowStats(lines, now, 7), d30: windowStats(lines, now, 30) };
}

/** Latest `n` latencies, oldest first; failed checks are `null`. */
export function sparkline(lines: HistoryLine[], n = 24): Array<number | null> {
  return lines.slice(-n).map((l) => (l.ok === 1 ? l.ms : null));
}

const RANK: Record<ClimateCode, number> = { '.': 0, c: 1, i: 2, f: 3, r: 4, b: 5 };

/** First day (UTC, YYYY-MM-DD) of a `days`-long window ending on `now`'s day. */
export function climateStart(now: number, days = 30): string {
  const end = new Date(now);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (days - 1)));
  return start.toISOString().slice(0, 10);
}

/**
 * One character per UTC day, oldest first: the most severe thing that happened
 * that day. breaking > risky > fog > info > clear > no data.
 */
export function climateRow(lines: HistoryLine[], events: Array<Pick<ChangeEvent, 'at' | 'severity'>>, now: number, days = 30): string {
  const startMs = Date.parse(`${climateStart(now, days)}T00:00:00Z`);
  const cells: ClimateCode[] = Array.from({ length: days }, () => '.');
  const bump = (t: string, code: ClimateCode) => {
    const idx = Math.floor((Date.parse(t) - startMs) / DAY);
    if (idx < 0 || idx >= days) return;
    if (RANK[code] > RANK[cells[idx]]) cells[idx] = code;
  };
  for (const l of lines) bump(l.t, l.ok === 1 ? 'c' : 'f');
  for (const e of events) bump(e.at, e.severity === 'breaking' ? 'b' : e.severity === 'risky' ? 'r' : 'i');
  return cells.join('');
}
