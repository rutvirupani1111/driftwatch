import { Link } from 'react-router';
import { formatMs, formatPct, relativeTime } from '../lib/format';
import type { ApiSummary } from '../lib/types';
import { CONDITION_META } from '../lib/weather';
import { Sparkline } from './charts';
import { Glyph } from './Glyph';
import { CONDITION_TEXT, CONDITION_VAR, Monogram, SeverityChip } from './ui';

/** One API as a weather station: glyph, condition, last change, uptime, latency. */
export function StationCard({ api, now }: { api: ApiSummary; now: number }) {
  const color = CONDITION_VAR[api.condition];
  const lastChange = api.lastChange;
  return (
    <Link
      to={`/api/${api.id}`}
      className="panel group relative flex h-full flex-col overflow-hidden p-4 transition-[transform,border-color] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-line-strong focus-visible:-translate-y-0.5 sm:p-5"
      aria-label={`${api.name}: ${CONDITION_META[api.condition].label}. ${api.reason}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `color-mix(in oklab, ${color} 22%, transparent)` }}
      />
      <div className="relative flex items-start gap-3">
        <Glyph condition={api.condition} size={52} title={false} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className={`font-serif text-[1.65rem] italic leading-none ${CONDITION_TEXT[api.condition]}`}>{CONDITION_META[api.condition].short}</div>
          <div className="mt-1.5 font-mono text-[0.68rem] text-ink-3">
            {api.condition === 'fog' ? `failed ${relativeTime(api.checkedAt, now)}` : lastChange ? `changed ${relativeTime(lastChange.at, now)}` : api.since ? `stable since ${new Date(api.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'stable'}
          </div>
        </div>
        <Monogram name={api.name} logo={api.logo} size={34} />
      </div>

      <h3 className="relative mt-3 text-[0.98rem] font-semibold leading-snug text-ink sm:mt-4">{api.name}</h3>
      <p className="relative mt-0.5 truncate font-mono text-[0.7rem] text-ink-3">
        {api.method !== 'GET' && <span className="mr-1 text-accent">{api.method}</span>}
        {api.host}
      </p>
      <p className="relative mt-2 line-clamp-1 text-[0.8rem] leading-snug text-ink-2 sm:line-clamp-2 sm:min-h-[2.5rem]">
        {api.condition === 'sunny' ? (api.description ?? api.reason) : api.reason}
      </p>
      {lastChange && api.condition !== 'sunny' && (
        <div className="relative mt-2">
          <SeverityChip severity={lastChange.severity} />
        </div>
      )}

      <div className="relative mt-auto pt-3 sm:pt-4">
        <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
          <dl className="grid grid-cols-2 gap-x-4 text-[0.7rem]">
            <dt className="text-ink-3">Uptime 7d</dt>
            <dt className="text-ink-3">p50</dt>
            <dd className="tabular font-mono text-[0.85rem] text-ink">{formatPct(api.uptime7d)}</dd>
            <dd className="tabular font-mono text-[0.85rem] text-ink">{formatMs(api.p50_7d)}</dd>
          </dl>
          <div className="w-24 shrink-0 sm:w-28">
            <Sparkline values={api.spark} color={color} height={30} label={`${api.name} latency, last ${api.spark.length} checks`} />
          </div>
        </div>
      </div>
    </Link>
  );
}
