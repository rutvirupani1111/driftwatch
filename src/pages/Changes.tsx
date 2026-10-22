import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EventCard } from '../components/ChangeList';
import { Glyph } from '../components/Glyph';
import { EmptyState, ErrorBlock, Icon, LoadingBlock, SEVERITY_LABEL } from '../components/ui';
import type { Severity } from '../lib/drift';
import { siteUrl, useGlobalChanges, useIndex } from '../lib/data';
import { useDocumentTitle, useNow } from '../lib/hooks';
import type { ChangeEvent } from '../lib/types';

const SEVERITIES: Severity[] = ['breaking', 'risky', 'info'];

export function Changes() {
  useDocumentTitle('Changes');
  const state = useGlobalChanges();
  const index = useIndex();
  const now = useNow(60_000);
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [apiId, setApiId] = useState('all');

  const events = state.status === 'ready' ? state.data.events : [];
  const filtered = useMemo(
    () => events.filter((e) => (severity === 'all' || e.severity === severity) && (apiId === 'all' || e.apiId === apiId)),
    [events, severity, apiId],
  );
  const groups = useMemo(() => {
    const map = new Map<string, ChangeEvent[]>();
    for (const e of filtered) {
      const day = new Date(e.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      map.set(day, [...(map.get(day) ?? []), e]);
    }
    return [...map.entries()];
  }, [filtered]);

  const apis = index.status === 'ready' ? [...index.data.apis].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, events.filter((e) => e.severity === s && (apiId === 'all' || e.apiId === apiId)).length])) as Record<Severity, number>;

  return (
    <>
      <header className="max-w-3xl">
        <p className="kicker">Changelog</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-ink sm:text-6xl">
          Every shift, <span className="italic text-accent">every shape</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          Each entry is one check that found the contract had moved: what changed, where, and how risky it is for code that depends on it.
        </p>
        <a href={siteUrl('feed.xml')} className="btn mt-6">
          <Icon name="feed" size={15} /> Subscribe via Atom
        </a>
      </header>

      <div className="sticky top-16 z-20 -mx-4 mt-10 border-y border-line/60 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1" role="group" aria-label="Filter by severity">
            <button type="button" className="chip" aria-pressed={severity === 'all'} onClick={() => setSeverity('all')}>
              All <span className="tabular font-mono text-[0.7rem] opacity-70">{counts.breaking + counts.risky + counts.info}</span>
            </button>
            {SEVERITIES.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? 'all' : s)}>
                <span className="size-1.5 rounded-full" style={{ background: `var(--${s})` }} aria-hidden="true" />
                {SEVERITY_LABEL[s]} <span className="tabular font-mono text-[0.7rem] opacity-70">{counts[s]}</span>
              </button>
            ))}
          </div>
          <label className="ml-auto w-full sm:w-64">
            <span className="sr-only">Filter by API</span>
            <select className="field" value={apiId} onChange={(e) => setApiId(e.target.value)}>
              <option value="all">All APIs</option>
              {apis.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-8">
        {state.status === 'loading' && <LoadingBlock rows={3} />}
        {state.status === 'error' && <ErrorBlock message={state.error} />}
        {state.status === 'ready' && filtered.length === 0 && (
          <EmptyState title={events.length ? 'Nothing matches these filters' : 'No drift recorded yet'} glyph={<Glyph condition="sunny" size={60} title={false} />}>
            {events.length ? (
              'Try a different severity or API.'
            ) : (
              <>
                Every watched API has kept its shape so far. To see what a drift report looks like, compare two payloads in the{' '}
                <Link className="link" to="/playground">
                  Playground
                </Link>
                .
              </>
            )}
          </EmptyState>
        )}
        {groups.map(([day, list]) => (
          <section key={day} className="mb-10" aria-label={day}>
            <h2 className="mb-4 font-serif text-2xl text-ink">{day}</h2>
            <div className="space-y-3">
              {list.map((e) => (
                <EventCard key={e.id} event={e} showApi now={now} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
