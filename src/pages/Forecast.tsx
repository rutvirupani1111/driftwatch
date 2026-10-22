import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Climate } from '../components/Climate';
import { Glyph } from '../components/Glyph';
import { StationCard } from '../components/StationCard';
import { CONDITION_TEXT, EmptyState, ErrorBlock, Icon, LoadingBlock, SectionHeading, SeverityChip } from '../components/ui';
import { siteUrl, useIndex } from '../lib/data';
import { nextCronRun, relativeTime } from '../lib/format';
import { useDocumentTitle, useNow } from '../lib/hooks';
import type { IndexFile } from '../lib/types';
import { CONDITION_META, CONDITIONS, type Condition } from '../lib/weather';

const ORDER: Record<Condition, number> = { storm: 0, fog: 1, 'partly-cloudy': 2, sunny: 3 };

function Headline({ counts, total }: { counts: Record<Condition, number>; total: number }) {
  const parts: ReactNode[] = [];
  const present = CONDITIONS.filter((c) => counts[c] > 0);
  if (present.length === 1 && present[0] === 'sunny') {
    return (
      <>
        <span className="italic text-sun">Clear skies</span> across all {total} APIs today
      </>
    );
  }
  present.forEach((c, i) => {
    const n = counts[c];
    const word = n === 1 ? CONDITION_META[c].singular : CONDITION_META[c].plural;
    if (i > 0) parts.push(i === present.length - 1 ? ' and ' : ', ');
    parts.push(
      <span key={c} className={`italic ${CONDITION_TEXT[c]}`}>
        {n} {word}
      </span>,
    );
  });
  return (
    <>
      {parts} today
    </>
  );
}

function Barometer({ index, value, onChange }: { index: IndexFile; value: Condition | 'all'; onChange: (c: Condition | 'all') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3" role="group" aria-label="Filter stations by condition">
      {CONDITIONS.map((c) => {
        const n = index.counts[c] ?? 0;
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? 'all' : c)}
            className={`panel group flex items-center gap-3 px-3 py-3 text-left transition-[border-color,opacity] sm:px-4 ${active ? 'border-line-strong ring-1 ring-accent/60' : 'hover:border-line-strong'} ${n === 0 ? 'opacity-60' : ''}`}
          >
            <Glyph condition={c} size={40} title={false} animated={n > 0} />
            <span className="min-w-0">
              <span className="tabular block font-mono text-2xl leading-none text-ink">{n}</span>
              <span className={`mt-1 block truncate font-serif text-base italic leading-none ${CONDITION_TEXT[c]}`}>{CONDITION_META[c].label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Hero({ index, now, condition, onCondition }: { index: IndexFile; now: number; condition: Condition | 'all'; onCondition: (c: Condition | 'all') => void }) {
  const issued = new Date(index.generatedAt);
  const next = nextCronRun(index.schedule, now);
  const dateline = issued.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <section aria-labelledby="forecast-heading" className="grid items-end gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
      <div>
        <p className="kicker">Forecast · {dateline}</p>
        <h1 id="forecast-heading" className="mt-4 font-serif text-[2.6rem] leading-[1.02] tracking-[-0.01em] text-ink xs:text-5xl sm:text-6xl lg:text-[4.6rem]">
          <Headline counts={index.counts} total={index.total} />
        </h1>
        <p className="mt-5 max-w-xl text-[0.98rem] leading-relaxed text-ink-2 sm:text-lg">
          Driftwatch calls {index.total} public APIs every three hours, learns the shape of each response, and reports when it drifts: what changed, when, and
          whether it would break you. Shapes, never values.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-ink-3">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            Issued {issued.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })} ({relativeTime(issued, now)})
          </span>
          {next && <span>Next scheduled run {relativeTime(next, now)}</span>}
          <a className="inline-flex items-center gap-1 hover:text-ink" href={siteUrl('feed.xml')}>
            <Icon name="feed" size={13} /> Atom feed
          </a>
        </p>
      </div>
      <Barometer index={index} value={condition} onChange={onCondition} />
    </section>
  );
}

export function Forecast() {
  useDocumentTitle(null);
  const state = useIndex();
  const now = useNow(30_000);
  const [category, setCategory] = useState<string>('all');
  const [condition, setCondition] = useState<Condition | 'all'>('all');
  const [query, setQuery] = useState('');

  const index = state.status === 'ready' ? state.data : null;
  const filtered = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index.apis
      .filter((a) => category === 'all' || a.category === category)
      .filter((a) => condition === 'all' || a.condition === condition)
      .filter((a) => !q || `${a.name} ${a.host} ${a.category} ${a.id}`.toLowerCase().includes(q))
      .sort((a, b) => ORDER[a.condition] - ORDER[b.condition] || a.name.localeCompare(b.name));
  }, [index, category, condition, query]);

  if (state.status === 'loading') return <LoadingBlock rows={4} />;
  if (state.status === 'error') return <ErrorBlock message={state.error} />;
  const data = state.data;
  const categoryCounts = data.categories.map((c) => ({ c, n: data.apis.filter((a) => a.category === c).length }));
  const firstSeen = data.apis.map((a) => a.since).filter(Boolean).sort()[0];

  return (
    <>
      <Hero index={data} now={now} condition={condition} onCondition={setCondition} />

      <section aria-labelledby="stations-heading" className="mt-16 sm:mt-20">
        <SectionHeading kicker={`${data.total} stations`} title="Every API, one sky" id="stations-heading">
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search stations</span>
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" type="search" placeholder="Search by name or host" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </SectionHeading>
        <div className="scroll-thin -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by category">
          <button type="button" className="chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
            All <span className="tabular font-mono text-[0.7rem] opacity-70">{data.total}</span>
          </button>
          {categoryCounts.map(({ c, n }) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? 'all' : c)}>
              {c} <span className="tabular font-mono text-[0.7rem] opacity-70">{n}</span>
            </button>
          ))}
          {condition !== 'all' && (
            <button type="button" className="chip" onClick={() => setCondition('all')} aria-label={`Clear the ${CONDITION_META[condition].label} filter`}>
              {CONDITION_META[condition].label} <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          Showing {filtered.length} of {data.total} stations
        </p>
        {filtered.length === 0 ? (
          <EmptyState title="No stations match" glyph={<Glyph condition="fog" size={56} title={false} />}>
            Try another category, clear the condition filter, or search for a different name.
          </EmptyState>
        ) : (
          <motion.ul layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false} mode="popLayout">
              {filtered.map((api, i) => (
                <motion.li
                  key={api.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.025, duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                >
                  <StationCard api={api} now={now} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </section>

      <section aria-labelledby="climate-heading" className="mt-20 sm:mt-24">
        <SectionHeading kicker={`Climate · ${data.climate.days} days`} title="The last month, day by day" id="climate-heading">
          <p className="max-w-sm text-sm text-ink-2">Each cell is one UTC day for one API. The worst thing that happened that day wins.</p>
        </SectionHeading>
        <div className="panel p-4 sm:p-6">
          <Climate climate={data.climate} apis={[...data.apis].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))} />
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="mt-20 sm:mt-24">
        <SectionHeading kicker="Latest" title="Recent drift" id="recent-heading">
          <Link to="/changes" className="btn">
            Full changelog <Icon name="arrow-right" size={15} />
          </Link>
        </SectionHeading>
        {data.recent.length === 0 ? (
          <EmptyState title="No drift recorded yet" glyph={<Glyph condition="sunny" size={60} title={false} />}>
            Every station has kept its shape{firstSeen ? ` since we started watching on ${new Date(firstSeen).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : ''}. When a field
            disappears or changes type it lands here, in the Atom feed and in your webhook. Want to see what drift looks like?{' '}
            <Link className="link" to="/playground">
              Try the Playground
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="panel divide-y divide-line">
            {data.recent.slice(0, 6).map((e) => (
              <li key={e.id}>
                <Link to={`/api/${e.apiId}#${encodeURIComponent(e.id)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-panel-2 sm:px-5">
                  <SeverityChip severity={e.severity} />
                  <span className="font-medium text-ink">{e.apiName}</span>
                  <span className="min-w-0 flex-1 basis-full truncate text-sm text-ink-2 sm:basis-0">{e.summary}</span>
                  <time dateTime={e.at} className="font-mono text-xs text-ink-3">
                    {relativeTime(e.at, now)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
