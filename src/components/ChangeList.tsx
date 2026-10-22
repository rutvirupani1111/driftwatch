import { useState } from 'react';
import { Link } from 'react-router';
import type { DriftChange, Severity } from '../lib/drift';
import { relativeTime } from '../lib/format';
import type { ChangeEvent } from '../lib/types';
import { Icon, SeverityChip } from './ui';

function countBy(changes: DriftChange[]): Record<Severity, number> {
  const out: Record<Severity, number> = { breaking: 0, risky: 0, info: 0 };
  for (const c of changes) out[c.severity]++;
  return out;
}

const KIND_LABEL: Record<string, string> = {
  // api-drift change kinds
  removed: 'removed',
  'status-changed': 'status changed',
  nullable: 'nullable',
  optional: 'now optional',
  'enum-added': 'new enum value',
  'number-narrowed': 'number narrowed',
  'number-widened': 'number widened',
  emptied: 'emptied',
  added: 'added',
  'added-optional': 'added (optional)',
  'enum-removed': 'enum value gone',
  'type-learned': 'type learned',
  negative: 'negatives appeared',
  // kinds written by the pre-api-drift engine (older data)
  'field-removed': 'removed',
  'field-added': 'added',
  'type-changed': 'type changed',
  'became-nullable': 'nullable',
  'required-to-optional': 'now optional',
  'integer-to-number': 'number widened',
  'format-changed': 'format changed',
  'format-lost': 'format lost',
  'format-gained': 'format gained',
  'enum-value-added': 'new enum value',
  'enum-value-removed': 'enum value gone',
  'type-gained': 'type learned',
  'items-gained': 'items appeared',
  'items-emptied': 'emptied',
};

/** One change: path, explanation, and a before → after type diff. */
export function ChangeRow({ change }: { change: DriftChange }) {
  return (
    <li className="grid gap-1.5 border-t border-line py-3 first:border-t-0 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SeverityChip severity={change.severity} />
        <span className="font-mono text-[0.68rem] uppercase tracking-wider text-ink-3">{KIND_LABEL[change.kind] ?? change.kind}</span>
      </div>
      <div className="min-w-0">
        <code className="break-all font-mono text-[0.8rem] text-ink">{change.path}</code>
        <p className="mt-0.5 text-sm text-ink-2">{change.message}</p>
        {(change.before || change.after) && (
          <div className="mt-2 grid gap-1 font-mono text-[0.75rem] sm:grid-cols-2 sm:gap-2">
            <div className="rounded-lg border border-breaking/25 bg-breaking/8 px-2.5 py-1.5 text-ink-2">
              <span className="mr-1.5 select-none text-breaking" aria-label="before">
                −
              </span>
              <span className="break-all">{change.before ?? 'missing'}</span>
            </div>
            <div className="rounded-lg border border-ok/25 bg-ok/8 px-2.5 py-1.5 text-ink-2">
              <span className="mr-1.5 select-none text-ok" aria-label="after">
                +
              </span>
              <span className="break-all">{change.after ?? 'missing'}</span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** A change event (one check that found drift), collapsible. */
export function EventCard({ event, showApi = false, defaultOpen = false, now = Date.now() }: { event: ChangeEvent; showApi?: boolean; defaultOpen?: boolean; now?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  const counts = countBy(event.changes);
  const when = new Date(event.at);
  return (
    <article id={event.id} className="panel scroll-mt-24 overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {(['breaking', 'risky', 'info'] as Severity[])
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <SeverityChip key={s} severity={s} count={counts[s]} />
              ))}
            <time dateTime={event.at} className="font-mono text-xs text-ink-3" title={when.toLocaleString()}>
              {when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {relativeTime(event.at, now)}
            </time>
          </div>
          {showApi && (
            <Link to={`/api/${event.apiId}`} className="mt-2 inline-block font-medium text-ink hover:underline">
              {event.apiName}
            </Link>
          )}
          <p className="mt-1.5 text-sm text-ink-2">{event.summary}</p>
        </div>
        <button type="button" className="btn shrink-0 py-1.5 text-xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'} {event.changes.length} change{event.changes.length === 1 ? '' : 's'}
          <Icon name="chevron" size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-line px-4 pb-2 sm:px-5">
          <ul>
            {event.changes.map((c, i) => (
              <ChangeRow key={`${c.path}-${c.kind}-${i}`} change={c} />
            ))}
          </ul>
          <p className="pb-3 font-mono text-[0.68rem] text-ink-3">
            fingerprint {event.fingerprintBefore} → {event.fingerprintAfter}
          </p>
        </div>
      )}
    </article>
  );
}
