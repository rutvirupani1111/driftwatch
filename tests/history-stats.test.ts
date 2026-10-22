import { describe, expect, it } from 'vitest';
import { compactHistory, mergeHistories, parseHistory, RETENTION_DAYS, serializeHistory } from '../monitor/history';
import { climateRow, climateStart, computeStats, percentile, sparkline, windowStats } from '../monitor/stats';
import { formatBytes, formatMs, formatPct, nextCronRun, relativeTime } from '../src/lib/format';
import type { HistoryLine } from '../src/lib/types';
import { DAY, HOUR } from './helpers';

const NOW = Date.parse('2026-10-23T03:17:00Z');
const line = (msAgo: number, ok: 0 | 1 = 1, ms = 100): HistoryLine => ({ t: new Date(NOW - msAgo).toISOString(), ok, s: ok ? 200 : 503, ms, b: 10 });

describe('history files', () => {
  it('round-trips and skips corrupt lines', () => {
    const lines = [line(2 * HOUR), line(HOUR)];
    const text = `${serializeHistory(lines)}{not json\n\n{"t":"nope"}\n`;
    expect(parseHistory(text)).toEqual(lines);
    expect(parseHistory('')).toEqual([]);
    expect(serializeHistory([])).toBe('');
  });

  it('compacts: drops lines past retention, sorts and dedupes by timestamp', () => {
    const old = line((RETENTION_DAYS + 1) * DAY);
    const a = line(3 * HOUR);
    const b = line(HOUR);
    const bLater = { ...b, ms: 999 };
    const out = compactHistory([b, old, a, bLater], NOW);
    expect(out).toEqual([a, bLater]);
    expect(compactHistory(out, NOW)).toEqual(out);
  });

  it('merges cached and committed histories', () => {
    const a = [line(3 * HOUR), line(2 * HOUR)];
    const b = [line(2 * HOUR), line(HOUR)];
    expect(mergeHistories(a, b, NOW).map((l) => l.t)).toEqual([line(3 * HOUR).t, line(2 * HOUR).t, line(HOUR).t]);
  });
});

describe('stats', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10], 95)).toBe(10);
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
  });

  it('computes uptime and latency over windows', () => {
    const lines = [line(10 * DAY, 1, 500), line(2 * DAY, 0, 0), line(DAY, 1, 100), line(HOUR, 1, 300)];
    const w7 = windowStats(lines, NOW, 7);
    expect(w7).toEqual({ checks: 3, ok: 2, uptime: 2 / 3, p50: 100, p95: 300 });
    const all = computeStats(lines, NOW);
    expect(all.d30.checks).toBe(4);
    expect(all.d1.checks).toBe(2);
    expect(windowStats([], NOW, 7).uptime).toBeNull();
  });

  it('builds sparklines with gaps for failures', () => {
    expect(sparkline([line(3 * HOUR, 1, 10), line(2 * HOUR, 0), line(HOUR, 1, 30)], 2)).toEqual([null, 30]);
  });

  it('builds climate rows with severity precedence', () => {
    expect(climateStart(NOW, 30)).toBe('2026-09-24');
    const row = climateRow(
      [line(0, 1), line(DAY, 0), line(2 * DAY, 1)],
      [
        { at: new Date(NOW - 2 * DAY).toISOString(), severity: 'info' },
        { at: new Date(NOW - DAY).toISOString(), severity: 'breaking' },
      ],
      NOW,
      30,
    );
    expect(row).toHaveLength(30);
    expect(row.slice(-3)).toBe('ibc');
    expect(row[0]).toBe('.');
  });
});

describe('format helpers', () => {
  it('formats relative times, durations, sizes and percentages', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 2 * HOUR, NOW)).toBe('2h ago');
    expect(relativeTime(NOW - 3 * DAY, NOW)).toBe('3d ago');
    expect(relativeTime(NOW + 2 * HOUR, NOW)).toBe('in 2h');
    expect(formatMs(120.4)).toBe('120 ms');
    expect(formatMs(1450)).toBe('1.4 s');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(0.98765)).toBe('98.8%');
    expect(formatPct(null)).toBe('—');
  });

  it('computes the next cron run', () => {
    expect(nextCronRun('17 */3 * * *', Date.parse('2026-10-23T03:20:00Z'))?.toISOString()).toBe('2026-10-23T06:17:00.000Z');
    expect(nextCronRun('17 */3 * * *', Date.parse('2026-10-23T22:00:00Z'))?.toISOString()).toBe('2026-10-24T00:17:00.000Z');
    expect(nextCronRun('nonsense')).toBeNull();
  });
});
