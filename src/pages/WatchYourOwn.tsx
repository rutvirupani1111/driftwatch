import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import ourConfig from '../../driftwatch.config.json';
import { REPO_URL } from '../components/Layout';
import { CodeBlock, CopyButton, Icon, SectionHeading } from '../components/ui';
import { isHttpUrl, METHODS, referencedSecrets, slugify, validateConfig, type DriftwatchConfig, type MonitorConfig } from '../lib/config';
import { downloadText, useDocumentTitle } from '../lib/hooks';

interface DraftMonitor {
  key: number;
  id: string;
  idTouched: boolean;
  name: string;
  category: string;
  method: string;
  url: string;
  docs: string;
  headers: Array<{ k: string; v: string }>;
  body: string;
  ignore: string;
  description: string;
}

interface Draft {
  title: string;
  url: string;
  repo: string;
  monitors: DraftMonitor[];
}

let nextKey = 1;

function blankMonitor(partial: Partial<DraftMonitor> = {}): DraftMonitor {
  return {
    key: nextKey++,
    id: '',
    idTouched: false,
    name: '',
    category: 'My APIs',
    method: 'GET',
    url: '',
    docs: '',
    headers: [],
    body: '',
    ignore: '',
    description: '',
    ...partial,
  };
}

function fromConfig(cfg: DriftwatchConfig): Draft {
  return {
    title: cfg.site?.title ?? 'Driftwatch',
    url: cfg.site?.url ?? '',
    repo: cfg.site?.repo ?? '',
    monitors: cfg.monitors.map((m) =>
      blankMonitor({
        id: m.id,
        idTouched: true,
        name: m.name,
        category: m.category,
        method: (m.method ?? 'GET').toUpperCase(),
        url: m.url,
        docs: m.docs,
        headers: Object.entries(m.headers ?? {}).map(([k, v]) => ({ k, v })),
        body: m.body === undefined ? '' : JSON.stringify(m.body, null, 2),
        ignore: (m.ignore ?? []).join(', '),
        description: m.description ?? '',
      }),
    ),
  };
}

const STARTER: Draft = {
  title: 'My API forecast',
  url: 'https://YOUR-USER.github.io/driftwatch/',
  repo: 'YOUR-USER/driftwatch',
  monitors: [
    blankMonitor({
      id: 'payments-status',
      idTouched: true,
      name: 'Payments: charge status',
      category: 'Vendors',
      url: 'https://api.vendor.example/v1/charges/ch_test_123',
      docs: 'https://docs.vendor.example/charges',
      headers: [{ k: 'Authorization', v: 'Bearer ${VENDOR_API_KEY}' }],
      ignore: '$.metadata',
    }),
  ],
};

function toConfig(d: Draft): DriftwatchConfig {
  return {
    $schema: './driftwatch.schema.json',
    site: { title: d.title || undefined, url: d.url || undefined, repo: d.repo || undefined },
    schedule: '17 */3 * * *',
    monitors: d.monitors.map((m) => {
      const out: MonitorConfig = { id: m.id, name: m.name, category: m.category, url: m.url, docs: m.docs };
      if (m.method !== 'GET') out.method = m.method;
      const headers = Object.fromEntries(m.headers.filter((h) => h.k.trim()).map((h) => [h.k.trim(), h.v]));
      if (Object.keys(headers).length) out.headers = headers;
      if (m.body.trim() && m.method !== 'GET') {
        try {
          out.body = JSON.parse(m.body);
        } catch {
          out.body = m.body;
        }
      }
      const ignore = m.ignore
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ignore.length) out.ignore = ignore;
      if (m.description.trim()) out.description = m.description.trim();
      return out;
    }),
  };
}

function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-storm">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

function MonitorEditor({ m, index, dupe, onChange, onRemove }: { m: DraftMonitor; index: number; dupe: boolean; onChange: (m: DraftMonitor) => void; onRemove: () => void }) {
  const set = (patch: Partial<DraftMonitor>) => onChange({ ...m, ...patch });
  const idError = m.id && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(m.id) ? 'Lowercase letters, digits and dashes' : dupe ? 'Another monitor uses this id' : undefined;
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-ink-3">monitor {index + 1}</span>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-storm" aria-label={`Remove monitor ${m.name || index + 1}`}>
          <Icon name="trash" size={13} /> Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className="field" value={m.name} placeholder="Payments: charge status" onChange={(e) => set({ name: e.target.value, id: m.idTouched ? m.id : slugify(e.target.value) })} />
        </Field>
        <Field label="Id" hint="Used in URLs, files and badges" error={idError}>
          <input className="field font-mono" value={m.id} placeholder="payments-status" onChange={(e) => set({ id: e.target.value, idTouched: true })} />
        </Field>
        <Field label="Category">
          <input className="field" value={m.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Method">
          <select className="field" value={m.method} onChange={(e) => set({ method: e.target.value })}>
            {METHODS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="URL" hint="May contain ${SECRET_NAME}" error={m.url && !isHttpUrl(m.url) ? 'Must be an http(s) URL' : undefined}>
            <input className="field font-mono" value={m.url} placeholder="https://api.example.com/v1/thing" onChange={(e) => set({ url: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Docs URL" error={m.docs && !isHttpUrl(m.docs) ? 'Must be an http(s) URL' : undefined}>
            <input className="field font-mono" value={m.docs} placeholder="https://docs.example.com" onChange={(e) => set({ docs: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="mt-4">
        <span className="mb-1 block text-xs font-medium text-ink-2">Headers</span>
        <ul className="space-y-2">
          {m.headers.map((h, i) => (
            <li key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <input
                className="field font-mono"
                aria-label="Header name"
                placeholder="Authorization"
                value={h.k}
                onChange={(e) => set({ headers: m.headers.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })}
              />
              <input
                className="field font-mono"
                aria-label="Header value"
                placeholder="Bearer ${API_TOKEN}"
                value={h.v}
                onChange={(e) => set({ headers: m.headers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })}
              />
              <button type="button" className="btn px-2.5" aria-label="Remove header" onClick={() => set({ headers: m.headers.filter((_, j) => j !== i) })}>
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline" onClick={() => set({ headers: [...m.headers, { k: '', v: '' }] })}>
          <Icon name="plus" size={13} /> Add header
        </button>
        {m.headers.some((h) => /secret|token|key|bearer/i.test(h.v) && !h.v.includes('${')) && (
          <p className="mt-2 text-xs text-risky">Looks like a literal credential. Put it in a GitHub Secret and reference it as {'${NAME}'} instead.</p>
        )}
      </div>
      {m.method !== 'GET' && m.method !== 'HEAD' && (
        <div className="mt-4">
          <Field label="JSON body">
            <textarea className="field h-24 font-mono text-xs" value={m.body} placeholder='{ "query": "..." }' onChange={(e) => set({ body: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Ignore paths" hint="Comma separated, e.g. $.meta, $.items[].debug">
          <input className="field font-mono" value={m.ignore} onChange={(e) => set({ ignore: e.target.value })} />
        </Field>
        <Field label="Description (optional)">
          <input className="field" value={m.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </motion.li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3.5rem_1fr]">
      <span className="font-serif text-4xl italic leading-none text-accent sm:text-5xl" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 pb-2">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
      </div>
    </li>
  );
}

function Path({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.78rem] text-ink">{children}</span>;
}

export default function WatchYourOwn() {
  useDocumentTitle('Watch your own');
  const [draft, setDraft] = useState<Draft>(STARTER);
  const config = useMemo(() => toConfig(draft), [draft]);
  const json = useMemo(() => `${JSON.stringify(config, null, 2)}\n`, [config]);
  const { errors } = useMemo(() => validateConfig(config), [config]);
  const secrets = useMemo(() => referencedSecrets(config.monitors), [config]);
  const ids = draft.monitors.map((m) => m.id);

  return (
    <>
      <header className="max-w-3xl">
        <p className="kicker">Template</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-ink sm:text-6xl">
          Watch <span className="italic text-accent">your own</span> APIs
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          Driftwatch is a template repository. Fork it, list the third-party APIs you depend on, and GitHub runs the monitor and hosts the dashboard for free. No servers, no
          database, no account anywhere else.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a className="btn btn-primary" href={`${REPO_URL}/generate`}>
            <Icon name="github" size={16} /> Use this template
          </a>
          <a className="btn" href={`${REPO_URL}/blob/main/template.md`}>
            <Icon name="book" size={15} /> template.md
          </a>
        </div>
      </header>

      <section aria-labelledby="steps-heading" className="mt-16">
        <SectionHeading kicker="Six steps · about ten minutes" title="From fork to forecast" id="steps-heading" />
        <ol className="space-y-8">
          <Step n={1} title="Create your copy">
            <p>
              Click <strong className="text-ink">Use this template</strong> (or fork). Keep the repository public if you want free GitHub Pages; the dashboard only ever shows
              shapes, never response values.
            </p>
          </Step>
          <Step n={2} title="List your APIs">
            <p>
              Edit <Path>driftwatch.config.json</Path>, or build it with the form below. Each monitor needs an <Path>id</Path>, <Path>name</Path>, <Path>category</Path>,{' '}
              <Path>url</Path> and <Path>docs</Path>; <Path>method</Path>, <Path>headers</Path>, <Path>body</Path> and <Path>ignore</Path> are optional. Delete the
              sample <Path>data/</Path> folder, <Path>public/badges</Path>, <Path>public/feeds</Path> and <Path>public/feed.xml</Path> for a clean start.
            </p>
          </Step>
          <Step n={3} title="Add secrets for private APIs">
            <p>
              <Path>Settings → Secrets and variables → Actions → New repository secret</Path>. Reference a secret as <Path>{'${NAME}'}</Path> in a header, URL or body, and
              expose it to the monitor step in <Path>.github/workflows/monitor.yml</Path>:
            </p>
            <CodeBlock label="monitor.yml" maxHeight={160} code={'      - name: Run the monitor\n        env:\n          VENDOR_API_KEY: ${{ secrets.VENDOR_API_KEY }}'} />
            <p>Secrets are substituted in memory at request time and never written to the data files (there is a test for that).</p>
          </Step>
          <Step n={4} title="Turn on Pages">
            <p>
              <Path>Settings → Pages → Build and deployment → Source: GitHub Actions</Path>. The site is built with your repository name as its base path automatically.
            </p>
          </Step>
          <Step n={5} title="Enable Actions and run the monitor">
            <p>
              Forks start with workflows switched off: open the <Path>Actions</Path> tab and enable them. Then run <Path>Monitor</Path> with{' '}
              <Path>Run workflow</Path>. After that it runs every three hours at :17 (off the hour, when GitHub's scheduler is quieter) and commits data only when something
              changed.
            </p>
          </Step>
          <Step n={6} title="Optional: get pinged">
            <p>
              Add a <Path>DISCORD_WEBHOOK_URL</Path> or <Path>SLACK_WEBHOOK_URL</Path> secret and breaking or risky changes are posted there. Everything is also in the Atom
              feed at <Path>/feed.xml</Path>, and every API has a badge for your README.
            </p>
          </Step>
        </ol>
      </section>

      <section aria-labelledby="builder-heading" className="mt-20">
        <SectionHeading kicker="Config builder" title="Build driftwatch.config.json" id="builder-heading">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn py-1.5 text-xs" onClick={() => setDraft(fromConfig(ourConfig as DriftwatchConfig))}>
              Start from our {ourConfig.monitors.length}
            </button>
            <button type="button" className="btn py-1.5 text-xs" onClick={() => setDraft({ ...STARTER, monitors: [blankMonitor()] })}>
              Start blank
            </button>
          </div>
        </SectionHeading>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="panel grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
              <Field label="Dashboard title">
                <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Public URL" hint="https://USER.github.io/REPO/">
                <input className="field font-mono" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </Field>
              <Field label="Repository" hint="owner/repo">
                <input className="field font-mono" value={draft.repo} onChange={(e) => setDraft({ ...draft, repo: e.target.value })} />
              </Field>
            </div>
            <ul className="mt-4 space-y-4">
              <AnimatePresence initial={false}>
                {draft.monitors.map((m, i) => (
                  <MonitorEditor
                    key={m.key}
                    m={m}
                    index={i}
                    dupe={!!m.id && ids.indexOf(m.id) !== i}
                    onChange={(next) => setDraft({ ...draft, monitors: draft.monitors.map((x) => (x.key === m.key ? next : x)) })}
                    onRemove={() => setDraft({ ...draft, monitors: draft.monitors.filter((x) => x.key !== m.key) })}
                  />
                ))}
              </AnimatePresence>
            </ul>
            <button type="button" className="btn mt-4 w-full border-dashed" onClick={() => setDraft({ ...draft, monitors: [...draft.monitors, blankMonitor()] })}>
              <Icon name="plus" size={15} /> Add a monitor
            </button>
          </div>
          <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
            <div className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${errors.length ? 'border-risky/35 bg-risky/10' : 'border-ok/30 bg-ok/10'}`} role="status" aria-live="polite">
              {errors.length ? (
                <>
                  <strong className="text-ink">{errors.length} thing{errors.length === 1 ? '' : 's'} to fix</strong>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
                    {errors.slice(0, 6).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <strong className="text-ink">Valid config · {config.monitors.length} monitor{config.monitors.length === 1 ? '' : 's'}</strong>
              )}
            </div>
            <CodeBlock code={json} label="driftwatch.config.json" maxHeight={560} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => downloadText('driftwatch.config.json', json)}>
                <Icon name="download" size={15} /> Download
              </button>
              <CopyButton text={json} label="Copy JSON" className="px-3 py-2 text-sm" />
            </div>
            {secrets.length > 0 && (
              <div className="panel mt-4 p-4">
                <div className="kicker mb-2 flex items-center gap-1.5">
                  <Icon name="key" size={13} /> Secrets to add
                </div>
                <ul className="flex flex-wrap gap-2">
                  {secrets.map((s) => (
                    <li key={s} className="rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink">
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-3">Add each one as a repository secret and pass it to the monitor step's env in monitor.yml.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
