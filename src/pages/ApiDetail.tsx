import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { EventCard } from '../components/ChangeList';
import { LatencyChart } from '../components/charts';
import { ContractTree } from '../components/ContractTree';
import { Glyph } from '../components/Glyph';
import { CodeBlock, CONDITION_TEXT, CopyButton, EmptyState, ErrorBlock, Icon, LoadingBlock, Monogram, SectionHeading, Stat, Tabs } from '../components/ui';
import { restoreShape, toTypeScript, toZod } from '../lib/drift';
import { publicUrl, siteUrl, useApiChanges, useApiHistory, useApiLatest, useIndex } from '../lib/data';
import { formatBytes, formatMs, formatPct, relativeTime } from '../lib/format';
import { useDocumentTitle, useNow } from '../lib/hooks';
import type { ApiLatest } from '../lib/types';
import { CONDITION_META } from '../lib/weather';

const SEVERITY_DOT: Record<string, string> = { breaking: 'var(--breaking)', risky: 'var(--risky)', info: 'var(--info)' };

function shortDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function ContractSection({ api }: { api: ApiLatest }) {
  const [tab, setTab] = useState<'tree' | 'ts' | 'zod'>('tree');
  const typeName = api.id.replace(/-/g, ' ');
  // Prefer the learned engine shape (api-drift typegen); fall back to the stored contract.
  const source = useMemo(() => restoreShape(api.shape) ?? api.contract, [api.shape, api.contract]);
  const ts = useMemo(() => (source ? toTypeScript(source, typeName) : ''), [source, typeName]);
  const zod = useMemo(() => (source ? toZod(source, typeName) : ''), [source, typeName]);
  if (!api.contract) {
    return (
      <EmptyState title="No contract yet" glyph={<Glyph condition="fog" size={52} title={false} />}>
        This API has not returned a successful JSON response yet, so there is no shape to show.
      </EmptyState>
    );
  }
  return (
    <div className="panel p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Contract view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tree', label: 'Tree' },
            { value: 'ts', label: 'TypeScript' },
            { value: 'zod', label: 'Zod' },
          ]}
        />
        <span className="font-mono text-xs text-ink-3">
          {api.fieldCount} fields · {api.samples} sample{api.samples === 1 ? '' : 's'} · fingerprint {api.fingerprint}
        </span>
      </div>
      <div role="tabpanel">
        {tab === 'tree' && <ContractTree contract={api.contract} />}
        {tab === 'ts' && <CodeBlock code={ts} label={`${api.id}.ts`} maxHeight={540} />}
        {tab === 'zod' && <CodeBlock code={zod} label={`${api.id}.schema.ts`} maxHeight={540} />}
      </div>
      {api.ignore && api.ignore.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Ignored by config: {api.ignore.map((p) => (
            <code key={p} className="mr-2 font-mono text-ink-2">
              {p}
            </code>
          ))}
        </p>
      )}
    </div>
  );
}

function BadgeSection({ api, siteBase }: { api: ApiLatest; siteBase: string }) {
  const badge = `${siteBase}badges/${api.id}.svg`;
  const page = `${siteBase}api/${api.id}`;
  const feed = `${siteBase}feeds/${api.id}.xml`;
  const markdown = `[![schema](${badge})](${page})`;
  const html = `<a href="${page}"><img src="${badge}" alt="API schema status for ${api.name}"></a>`;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="panel min-w-0 p-4 sm:p-6">
        <div className="kicker mb-3">Badge</div>
        <img src={siteUrl(`badges/${api.id}.svg`)} alt={`Schema badge for ${api.name}`} className="h-5" />
        <div className="mt-4 space-y-3">
          <CodeBlock code={markdown} label="Markdown" maxHeight={120} />
          <CodeBlock code={html} label="HTML" maxHeight={120} />
        </div>
      </div>
      <div className="panel min-w-0 p-4 sm:p-6">
        <div className="kicker mb-3">Subscribe</div>
        <p className="text-sm text-ink-2">Every contract change for this API, as an Atom feed. Works in any feed reader, Slack's RSS app or a GitHub Action.</p>
        <div className="code-surface mt-4 flex items-center gap-2 px-3 py-2">
          <Icon name="feed" size={15} className="text-risky" />
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">{feed}</code>
          <CopyButton text={feed} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a className="chip" href={siteUrl(`data/apis/${api.id}/latest.json`)}>
            latest.json
          </a>
          <a className="chip" href={siteUrl(`data/apis/${api.id}/history.jsonl`)}>
            history.jsonl
          </a>
          <a className="chip" href={siteUrl(`data/apis/${api.id}/changes.json`)}>
            changes.json
          </a>
        </div>
      </div>
    </div>
  );
}

export function ApiDetail() {
  const { id = '' } = useParams();
  const latest = useApiLatest(id);
  const changes = useApiChanges(id);
  const history = useApiHistory(id);
  const index = useIndex();
  const now = useNow(30_000);
  useDocumentTitle(latest.status === 'ready' ? latest.data.name : null);

  if (latest.status === 'loading') return <LoadingBlock rows={4} />;
  if (latest.status === 'error') {
    if (latest.error === 'not-found') {
      return (
        <EmptyState title={`No station called “${id}”`} glyph={<Glyph condition="fog" size={64} title={false} />}>
          It may have been renamed or removed from the config.{' '}
          <Link className="link" to="/">
            Back to the forecast
          </Link>
          .
        </EmptyState>
      );
    }
    return <ErrorBlock message={latest.error} />;
  }

  const api = latest.data;
  const events = changes.status === 'ready' ? [...changes.data].reverse() : [];
  const siteBase = publicUrl(index.status === 'ready' ? index.data : undefined, '');
  const w = api.weather;
  const s = api.stats;

  return (
    <article>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <Icon name="arrow-left" size={15} /> Forecast
      </Link>

      <header className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="flex items-center gap-4">
          <Glyph condition={w.condition} size={104} />
          <div className="lg:hidden">
            <div className={`font-serif text-4xl italic leading-none ${CONDITION_TEXT[w.condition]}`}>{CONDITION_META[w.condition].label}</div>
            <div className="mt-2 font-mono text-xs text-ink-3">
              {w.since ? (w.condition === 'sunny' ? `stable since ${shortDate(w.since)}` : relativeTime(w.since, now)) : `checked ${relativeTime(api.checkedAt, now)}`}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="hidden items-baseline gap-3 lg:flex">
            <span className={`font-serif text-4xl italic leading-none ${CONDITION_TEXT[w.condition]}`}>{CONDITION_META[w.condition].label}</span>
            <span className="font-mono text-xs text-ink-3">{w.since ? (w.condition === 'sunny' ? `stable since ${shortDate(w.since)}` : relativeTime(w.since, now)) : ''}</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 font-serif text-[2.4rem] leading-[1.05] text-ink sm:text-5xl lg:mt-3">
            {api.name}
          </h1>
          <p className="mt-3 max-w-3xl text-ink-2">{w.reason}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Monogram name={api.name} logo={api.logo} size={28} />
            <code className="code-surface inline-flex min-w-0 max-w-full items-center gap-2 px-2.5 py-1 font-mono text-[0.72rem] text-ink-2">
              <span className="font-semibold text-accent">{api.method}</span>
              <span className="min-w-0 break-all">{api.url}</span>
            </code>
            <span className="chip">{api.category}</span>
            <a href={api.docs} className="chip" rel="noreferrer">
              <Icon name="book" size={13} /> Docs
            </a>
            <a href={siteUrl(`feeds/${api.id}.xml`)} className="chip">
              <Icon name="feed" size={13} /> Feed
            </a>
          </div>
          {api.description && <p className="mt-3 max-w-3xl text-sm text-ink-3">{api.description}</p>}
        </div>
      </header>

      <section aria-label="Vital signs" className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Uptime 7d" value={formatPct(s.d7.uptime)} hint={`${s.d7.ok}/${s.d7.checks} checks`} accent={s.d7.uptime !== null && s.d7.uptime < 0.99 ? 'var(--risky)' : undefined} />
        <Stat label="Uptime 30d" value={formatPct(s.d30.uptime)} hint={`${s.d30.ok}/${s.d30.checks} checks`} />
        <Stat label="Latency 7d" value={formatMs(s.d7.p50)} hint={`p95 ${formatMs(s.d7.p95)}`} />
        <Stat
          label="Last check"
          value={api.ok ? `HTTP ${api.status}` : api.error?.code ?? 'failed'}
          hint={`${relativeTime(api.checkedAt, now)} · ${formatMs(api.latencyMs)}`}
          accent={api.ok ? 'var(--ok)' : 'var(--storm)'}
        />
        <Stat label="Response" value={formatBytes(api.sizeBytes)} hint={api.contentType?.split(';')[0] ?? '—'} />
        <Stat label="Fields" value={api.fieldCount} hint={`${api.samples} samples learned`} />
        <Stat label="Contract since" value={shortDate(api.contractSince)} hint={api.lastChange ? `last change ${relativeTime(api.lastChange.at, now)}` : 'no changes seen'} />
        <Stat label="Watching since" value={shortDate(api.firstSeenAt)} hint={`p95 30d ${formatMs(s.d30.p95)}`} />
      </section>

      {!api.ok && api.error && (
        <div role="status" className="mt-6 rounded-2xl border border-storm/30 bg-storm/10 px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">Latest check failed:</strong> {api.error.message}. The contract below is the last one we saw.
        </div>
      )}

      <section aria-labelledby="latency-heading" className="mt-14">
        <SectionHeading kicker="Latency · 30 days" title="Response times" id="latency-heading" />
        <div className="panel p-3 sm:p-5">
          {history.status === 'ready' ? (
            history.data.length ? (
              <LatencyChart history={history.data} p50={s.d30.p50} p95={s.d30.p95} />
            ) : (
              <p className="text-sm text-ink-3">No checks recorded yet.</p>
            )
          ) : history.status === 'error' ? (
            <p className="text-sm text-ink-3">History unavailable.</p>
          ) : (
            <div className="h-[200px] animate-pulse rounded-xl bg-panel-2" />
          )}
        </div>
      </section>

      <section aria-labelledby="contract-heading" className="mt-14">
        <SectionHeading kicker="Contract" title="What it returns" id="contract-heading">
          <p className="max-w-md text-sm text-ink-2">Learned from every successful response. Types, formats and optional fields, never the values.</p>
        </SectionHeading>
        <ContractSection api={api} />
      </section>

      <section aria-labelledby="timeline-heading" className="mt-14">
        <SectionHeading kicker="Timeline" title="Contract changes" id="timeline-heading" />
        {changes.status === 'loading' ? (
          <LoadingBlock rows={2} />
        ) : events.length === 0 ? (
          <EmptyState title="No drift on record" glyph={<Glyph condition="sunny" size={56} title={false} />}>
            The shape of this API has not changed since we started watching on {shortDate(api.firstSeenAt)}.
          </EmptyState>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5 sm:pl-7">
            {events.map((e, i) => (
              <li key={e.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.6rem] top-6 size-3 rounded-full ring-4 ring-bg sm:-left-[2.1rem]"
                  style={{ background: SEVERITY_DOT[e.severity] }}
                />
                <EventCard event={e} defaultOpen={i === 0} now={now} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="embed-heading" className="mt-14">
        <SectionHeading kicker="Embed" title="Badge and feed" id="embed-heading" />
        <BadgeSection api={api} siteBase={siteBase} />
      </section>
    </article>
  );
}
