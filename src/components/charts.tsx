import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatMs } from '../lib/format';
import type { HistoryLine } from '../lib/types';

/** Width of an element, kept current with ResizeObserver. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Compact latency sparkline. `null` entries are failed checks (drawn as dots). */
export function Sparkline({ values, color = 'var(--cloud)', height = 32, label }: { values: Array<number | null>; color?: string; height?: number; label?: string }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = 120;
  const H = height;
  const pts = values.map((v, i) => ({ i, v }));
  const ok = pts.filter((p): p is { i: number; v: number } => p.v !== null);
  if (values.length === 0) return <div style={{ height }} className="text-xs text-ink-3">no data</div>;
  const max = Math.max(...ok.map((p) => p.v), 1);
  const min = Math.min(...ok.map((p) => p.v), max);
  const span = Math.max(max - min, max * 0.25, 1);
  const x = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
  const y = (v: number) => H - 3 - ((v - (min - span * 0.15)) / (span * 1.3)) * (H - 6);
  const line = ok.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = ok.length > 1 ? `${line} L${x(ok.at(-1)!.i).toFixed(1)} ${H} L${x(ok[0].i).toFixed(1)} ${H} Z` : '';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label={label ?? `Latency of the last ${values.length} checks`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gid})`} />}
      {ok.length > 1 && <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
      {ok.length === 1 && <circle cx={x(ok[0].i)} cy={y(ok[0].v)} r="2" style={{ fill: color }} />}
      {pts
        .filter((p) => p.v === null)
        .map((p) => (
          <rect key={p.i} x={x(p.i) - 1} y={H - 7} width="2" height="7" style={{ fill: 'var(--storm)' }} />
        ))}
    </svg>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Latency over time with p50 / p95 guides, failed checks and a hover readout. */
export function LatencyChart({ history, p50, p95, days = 30 }: { history: HistoryLine[]; p50: number | null; p95: number | null; days?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 200;
  const pad = { l: 46, r: 12, t: 14, b: 26 };
  const lines = useMemo(() => {
    const cutoff = Date.now() - days * 86_400_000;
    return history.filter((l) => Date.parse(l.t) >= cutoff);
  }, [history, days]);
  const W = Math.max(width, 280);
  const t0 = lines.length ? Date.parse(lines[0].t) : Date.now() - 3_600_000;
  const t1 = lines.length ? Math.max(Date.parse(lines.at(-1)!.t), t0 + 3_600_000) : Date.now();
  const okVals = lines.filter((l) => l.ok === 1).map((l) => l.ms);
  const yMax = niceMax(Math.max(...okVals, p95 ?? 0, 100) * 1.1);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const okPts = lines.filter((l) => l.ok === 1).map((l) => ({ x: x(Date.parse(l.t)), y: y(l.ms), l }));
  const path = okPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const failed = lines.filter((l) => l.ok === 0);
  const ticks = [0, yMax / 2, yMax];
  const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hovered = hover !== null ? lines[hover] : null;
  const summary = `Latency over the last ${days} days: ${lines.length} checks, median ${formatMs(p50)}, p95 ${formatMs(p95)}, ${failed.length} failed.`;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!lines.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    lines.forEach((l, i) => {
      const d = Math.abs(x(Date.parse(l.t)) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <figure className="relative" ref={ref}>
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={summary} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--line)' }} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
                {formatMs(t)}
              </text>
            </g>
          ))}
          {p95 !== null && (
            <g>
              <line x1={pad.l} x2={W - pad.r} y1={y(p95)} y2={y(p95)} style={{ stroke: 'var(--risky)' }} strokeDasharray="4 4" opacity="0.6" />
              <text x={W - pad.r} y={y(p95) - 4} textAnchor="end" className="fill-risky font-mono text-[10px]">
                p95 {formatMs(p95)}
              </text>
            </g>
          )}
          {p50 !== null && (
            <g>
              <line x1={pad.l} x2={W - pad.r} y1={y(p50)} y2={y(p50)} style={{ stroke: 'var(--ok)' }} strokeDasharray="2 4" opacity="0.6" />
              <text x={W - pad.r} y={y(p50) + 12} textAnchor="end" className="fill-ok font-mono text-[10px]">
                p50 {formatMs(p50)}
              </text>
            </g>
          )}
          {okPts.length > 1 && <path d={path} fill="none" style={{ stroke: 'var(--cloud)' }} strokeWidth="1.8" strokeLinejoin="round" />}
          {okPts.length <= 90 &&
            okPts.map((p) => <circle key={p.l.t} cx={p.x} cy={p.y} r={okPts.length > 40 ? 1.6 : 2.6} style={{ fill: 'var(--cloud)' }} />)}
          {failed.map((l) => (
            <g key={l.t}>
              <line x1={x(Date.parse(l.t))} x2={x(Date.parse(l.t))} y1={pad.t} y2={H - pad.b} style={{ stroke: 'var(--storm)' }} opacity="0.35" />
              <circle cx={x(Date.parse(l.t))} cy={H - pad.b} r="3" style={{ fill: 'var(--storm)' }} />
            </g>
          ))}
          <text x={pad.l} y={H - 6} className="fill-ink-3 font-mono text-[10px]">
            {fmtDate(t0)}
          </text>
          <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
            {fmtDate(t1)}
          </text>
          {hovered && (
            <line x1={x(Date.parse(hovered.t))} x2={x(Date.parse(hovered.t))} y1={pad.t} y2={H - pad.b} style={{ stroke: 'var(--ink-3)' }} strokeDasharray="2 3" />
          )}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-panel-solid px-2.5 py-1.5 font-mono text-[11px] text-ink shadow-lg"
          style={{ left: Math.min(Math.max(x(Date.parse(hovered.t)) - 70, 0), W - 160) }}
        >
          <div className="text-ink-3">{fmtDate(Date.parse(hovered.t))}</div>
          <div>{hovered.ok ? `${formatMs(hovered.ms)} · HTTP ${hovered.s}` : `failed · ${hovered.e ?? `HTTP ${hovered.s}`}`}</div>
        </div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
