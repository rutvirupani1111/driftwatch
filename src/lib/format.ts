/** Small, dependency-free formatting helpers shared by the monitor and the site. */

const UNITS: Array<[limit: number, divisor: number, unit: string]> = [
  [60_000, 1_000, 's'],
  [3_600_000, 60_000, 'm'],
  [86_400_000, 3_600_000, 'h'],
  [86_400_000 * 14, 86_400_000, 'd'],
  [86_400_000 * 60, 86_400_000 * 7, 'w'],
  [Infinity, 86_400_000 * 30, 'mo'],
];

/** "just now", "5m ago", "2h ago", "3d ago", "in 2h" */
export function relativeTime(iso: string | number | Date, now: number | Date = Date.now()): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const n = typeof now === 'number' ? now : now.getTime();
  if (!Number.isFinite(t)) return 'never';
  const delta = n - t;
  const abs = Math.abs(delta);
  if (abs < 45_000) return 'just now';
  for (const [limit, divisor, unit] of UNITS) {
    if (abs < limit) {
      const v = Math.max(1, Math.round(abs / divisor));
      return delta >= 0 ? `${v}${unit} ago` : `in ${v}${unit}`;
    }
  }
  return 'long ago';
}

/** "120 ms", "1.4 s" */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** "980 B", "4.2 KB", "1.1 MB" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 0.9876 → "98.8%", 1 → "100%" */
export function formatPct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  if (pct >= 99.995) return '100%';
  return `${pct.toFixed(pct >= 99 ? 2 : 1)}%`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** YYYY-MM-DD in UTC */
export function utcDay(t: string | number | Date): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Next run time for a simple "M H/step * * *" or "M H,H * * *" cron (UTC). */
export function nextCronRun(cron: string, from: number | Date = Date.now()): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minField, hourField] = parts;
  const minute = Number(minField);
  if (!Number.isInteger(minute)) return null;
  let hours: number[] = [];
  if (hourField === '*') hours = Array.from({ length: 24 }, (_, i) => i);
  else if (/^\*\/\d+$/.test(hourField)) {
    const step = Number(hourField.slice(2));
    for (let h = 0; h < 24; h += step) hours.push(h);
  } else if (/^\d+(,\d+)*$/.test(hourField)) hours = hourField.split(',').map(Number);
  else return null;
  const start = new Date(typeof from === 'number' ? from : from.getTime());
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (const h of hours) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + dayOffset, h, minute));
      if (d.getTime() > start.getTime()) return d;
    }
  }
  return null;
}
