import { useState, type ReactNode } from 'react';
import type { Severity } from '../lib/drift';
import { copyText } from '../lib/hooks';
import { CONDITION_META, type Condition } from '../lib/weather';

/* ------------------------------------------------------------------ icons */

type IconName =
  | 'arrow-right'
  | 'arrow-left'
  | 'external'
  | 'copy'
  | 'check'
  | 'feed'
  | 'github'
  | 'sun'
  | 'moon'
  | 'search'
  | 'chevron'
  | 'menu'
  | 'close'
  | 'download'
  | 'upload'
  | 'book'
  | 'plus'
  | 'trash'
  | 'key';

const PATHS: Record<IconName, ReactNode> = {
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  feed: (
    <>
      <path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14" />
      <circle cx="6" cy="18" r="1.4" fill="currentColor" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1.3-4-2-6-2.5m12 4.5v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.6 5.6 2.9 5.6 2.9a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.3c0 4.6 2.8 5.6 5.5 6a3 3 0 0 0-.8 2.3V21" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />,
  upload: <path d="M12 20V9m0 0l-4.5 4.5M12 9l4.5 4.5M5 4h14" />,
  book: <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8m-3 3l2 2m-5 1l2 2" />
    </>
  ),
};

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------- severity + weather */

export const SEVERITY_LABEL: Record<Severity, string> = { breaking: 'Breaking', risky: 'Risky', info: 'Info' };

const SEVERITY_CLASS: Record<Severity, string> = {
  breaking: 'text-breaking border-breaking/35 bg-breaking/10',
  risky: 'text-risky border-risky/35 bg-risky/10',
  info: 'text-info border-info/35 bg-info/10',
};

export function SeverityChip({ severity, count, className = '' }: { severity: Severity; count?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider ${SEVERITY_CLASS[severity]} ${className}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {SEVERITY_LABEL[severity]}
      {count !== undefined && <span className="opacity-75">{count}</span>}
    </span>
  );
}

export const CONDITION_TEXT: Record<Condition, string> = {
  sunny: 'text-sun',
  'partly-cloudy': 'text-cloud',
  storm: 'text-storm',
  fog: 'text-fog',
};

export const CONDITION_VAR: Record<Condition, string> = {
  sunny: 'var(--sun)',
  'partly-cloudy': 'var(--cloud)',
  storm: 'var(--storm)',
  fog: 'var(--fog)',
};

export function ConditionLabel({ condition, className = '' }: { condition: Condition; className?: string }) {
  return <span className={`font-serif italic ${CONDITION_TEXT[condition]} ${className}`}>{CONDITION_META[condition].label}</span>;
}

/* ---------------------------------------------------------------- monogram */

function hue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/** "CoinGecko: simple price" → "CG", "Open-Meteo: forecast" → "OM", "crates.io: serde" → "CR" */
export function monogramLetters(name: string): string {
  const brand = name.split(':')[0].trim();
  const words = brand.split(/[\s-]+/).filter(Boolean);
  const first = words[0] ?? name;
  const caps = first.replace(/[^A-Z]/g, '');
  if (caps.length >= 2) return first.length <= 4 ? first.slice(0, 2) : caps.slice(0, 2);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return first.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
}

/** A small typographic tile standing in for third-party logos (no external images). */
export function Monogram({ name, logo, size = 36 }: { name: string; logo?: string; size?: number }) {
  if (logo && /^https?:\/\//.test(logo)) {
    return <img src={logo} alt="" width={size} height={size} className="rounded-xl border border-line object-contain" loading="lazy" />;
  }
  const letters = logo ?? monogramLetters(name);
  const h = hue(name);
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-xl border border-line font-mono text-[0.7rem] font-semibold tracking-wide text-ink"
      style={{ width: size, height: size, background: `linear-gradient(140deg, hsl(${h} 70% 60% / 0.28), hsl(${(h + 40) % 360} 70% 50% / 0.12))` }}
    >
      {letters}
    </span>
  );
}

/* ------------------------------------------------------------ copy + code */

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink ${className}`}
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'copied' : 'failed');
        setTimeout(() => setState('idle'), 1600);
      }}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={13} />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span>
    </button>
  );
}

export function CodeBlock({ code, label, maxHeight = 420, className = '' }: { code: string; label?: string; maxHeight?: number; className?: string }) {
  return (
    <div className={`code-surface relative ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="kicker">{label ?? 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="scroll-thin overflow-auto p-3 font-mono text-[0.78rem] leading-relaxed text-ink-2" style={{ maxHeight }} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------- layout bits */

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="kicker">{label}</div>
      <div className="tabular mt-1 font-mono text-lg font-medium text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function SectionHeading({ kicker, title, children, id }: { kicker?: string; title: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h2 id={id} className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function LoadingBlock({ label = 'Reading the instruments…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-panel" />
      ))}
    </div>
  );
}

export function ErrorBlock({ title = 'The instruments are offline', message }: { title?: string; message: string }) {
  return (
    <div role="alert" className="panel p-6">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-2">
        {message === 'not-found' ? 'No data has been published for this yet. Run the monitor (npm run monitor) to create it.' : `Could not load data: ${message}.`}
      </p>
    </div>
  );
}

export function EmptyState({ title, children, glyph }: { title: string; children?: ReactNode; glyph?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-10 text-center">
      {glyph}
      <h3 className="mt-3 font-serif text-2xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Accessible tab list driven by a value; renders only the buttons. */
export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className="chip"
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const idx = options.findIndex((x) => x.value === value);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const next = options[(idx + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
              requestAnimationFrame(() => (e.currentTarget.parentElement?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus());
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
