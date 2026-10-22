import { Link } from 'react-router';
import type { ApiSummary, Climate as ClimateData, ClimateCode } from '../lib/types';

const CELL: Record<ClimateCode, { label: string; style: React.CSSProperties }> = {
  '.': { label: 'not watched yet', style: { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line)' } },
  c: { label: 'clear', style: { background: 'color-mix(in oklab, var(--sun) 22%, transparent)' } },
  i: { label: 'additive change', style: { background: 'var(--info)' } },
  r: { label: 'risky change', style: { background: 'var(--risky)' } },
  f: { label: 'failed checks (fog)', style: { background: 'repeating-linear-gradient(135deg, var(--fog) 0 2px, transparent 2px 4px)' } },
  b: { label: 'breaking change', style: { background: 'var(--breaking)' } },
};

const LEGEND: ClimateCode[] = ['c', 'i', 'r', 'b', 'f', '.'];

function dayLabel(start: string, offset: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/** 30-day "climate" heatmap: one row per API, one cell per UTC day, worst event wins. */
export function Climate({ climate, apis }: { climate: ClimateData; apis: ApiSummary[] }) {
  const rows = apis.filter((a) => climate.rows[a.id]);
  const days = climate.days;
  const totals = Array.from({ length: days }, (_, d) => {
    let events = 0;
    let fog = 0;
    for (const a of rows) {
      const c = climate.rows[a.id][d] as ClimateCode;
      if (c === 'b' || c === 'r' || c === 'i') events++;
      if (c === 'f') fog++;
    }
    return { events, fog };
  });
  const cols = `var(--climate-label) repeat(${days}, minmax(0, 1fr))`;
  const showLabel = (d: number) => d % 7 === 0 || (d === days - 1 && (days - 1) % 7 >= 3);
  return (
    <div className="[--climate-label:5.75rem] sm:[--climate-label:10rem]">
      <div role="table" aria-label={`Contract changes and outages per API over ${days} days`} className="text-xs">
        <div role="rowgroup">
          <div role="row" className="grid items-end gap-[2px] pb-1 sm:gap-[3px]" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader" className="kicker">
              Station
            </span>
            {Array.from({ length: days }, (_, d) => (
              <span role="columnheader" key={d} className="relative h-3 font-mono text-[0.6rem] text-ink-3" aria-label={dayLabel(climate.start, d)}>
                {showLabel(d) ? <span className="absolute left-0 whitespace-nowrap">{dayLabel(climate.start, d, { day: 'numeric', month: 'short' })}</span> : null}
              </span>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          <div role="row" className="mb-1.5 grid items-center gap-[2px] border-b border-line pb-1.5 sm:gap-[3px]" style={{ gridTemplateColumns: cols }}>
            <span role="rowheader" className="truncate pr-2 font-medium text-ink-2">
              All stations
            </span>
            {totals.map((t, d) => (
              <span
                role="cell"
                key={d}
                className="flex h-5 items-end justify-center"
                aria-label={`${dayLabel(climate.start, d)}: ${t.events} API${t.events === 1 ? '' : 's'} changed, ${t.fog} with failed checks`}
                title={`${dayLabel(climate.start, d)}: ${t.events} changed, ${t.fog} foggy`}
              >
                <span
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.min(100, 18 + t.events * 22 + t.fog * 10)}%`,
                    background: t.events ? 'var(--accent)' : t.fog ? 'var(--fog)' : 'var(--line-strong)',
                    opacity: t.events || t.fog ? 0.9 : 0.5,
                  }}
                />
              </span>
            ))}
          </div>
          {rows.map((a) => (
            <div role="row" key={a.id} className="grid items-center gap-[2px] py-[1.5px] sm:gap-[3px]" style={{ gridTemplateColumns: cols }}>
              <Link role="rowheader" to={`/api/${a.id}`} className="truncate pr-2 text-ink-2 hover:text-ink" title={a.name}>
                {a.name.split(':')[0]}
              </Link>
              {Array.from(climate.rows[a.id]).map((code, d) => {
                const c = CELL[code as ClimateCode] ?? CELL['.'];
                return <span role="cell" key={d} className="block aspect-square min-h-[6px] rounded-[3px]" style={c.style} aria-label={`${a.name}, ${dayLabel(climate.start, d)}: ${c.label}`} title={`${dayLabel(climate.start, d)}: ${c.label}`} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-3" aria-label="Legend">
        {LEGEND.map((code) => (
          <li key={code} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={CELL[code].style} aria-hidden="true" />
            {CELL[code].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
