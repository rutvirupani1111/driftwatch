import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { ChangeRow } from '../components/ChangeList';
import { ContractTree } from '../components/ContractTree';
import { Glyph } from '../components/Glyph';
import { CodeBlock, CONDITION_TEXT, EmptyState, Icon, SectionHeading, SeverityChip, Tabs } from '../components/ui';
import { diff, importHar, infer, maxSeverity, toContract, toTypeScript, toZod, type ContractNode, type HarImport, type Severity, type Shape } from '../lib/drift';
import { siteUrl } from '../lib/data';
import { COMPARE_EXAMPLES, pretty } from '../lib/examples';
import { downloadText, useDocumentTitle } from '../lib/hooks';
import { normalizePayload } from '../lib/normalize';
import { CONDITION_META, conditionForSeverity } from '../lib/weather';

type Parsed = { ok: true; value: unknown } | { ok: false; error: string } | { ok: null };

function parse(text: string): Parsed {
  if (!text.trim()) return { ok: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function TypesTabs({ contract, shape, name }: { contract: ContractNode; shape: Shape; name: string }) {
  const [tab, setTab] = useState<'tree' | 'ts' | 'zod'>('tree');
  const ts = useMemo(() => toTypeScript(shape, name), [shape, name]);
  const zod = useMemo(() => toZod(shape, name), [shape, name]);
  return (
    <div>
      <div className="mb-3">
        <Tabs
          label="Output"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tree', label: 'Contract' },
            { value: 'ts', label: 'TypeScript' },
            { value: 'zod', label: 'Zod' },
          ]}
        />
      </div>
      <div role="tabpanel">
        {tab === 'tree' && <ContractTree contract={contract} defaultDepth={2} />}
        {tab === 'ts' && <CodeBlock code={ts} label={`${name}.ts`} />}
        {tab === 'zod' && <CodeBlock code={zod} label={`${name}.schema.ts`} />}
      </div>
    </div>
  );
}

function Editor({ id, label, value, onChange, parsed }: { id: string; label: string; value: string; onChange: (v: string) => void; parsed: Parsed }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="kicker">
          {label}
        </label>
        <span className={`font-mono text-[0.68rem] ${parsed.ok === false ? 'text-storm' : 'text-ink-3'}`} aria-live="polite">
          {parsed.ok === false ? 'invalid JSON' : parsed.ok ? 'valid JSON' : 'empty'}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-invalid={parsed.ok === false}
        aria-describedby={parsed.ok === false ? `${id}-error` : undefined}
        className="field scroll-thin h-72 resize-y font-mono text-[0.78rem] leading-relaxed sm:h-96"
        placeholder='{ "paste": "a JSON response" }'
      />
      {parsed.ok === false && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-storm">
          {parsed.error}
        </p>
      )}
    </div>
  );
}

function Compare() {
  const [before, setBefore] = useState(() => pretty(COMPARE_EXAMPLES[0].before));
  const [after, setAfter] = useState(() => pretty(COMPARE_EXAMPLES[0].after));
  const [active, setActive] = useState(COMPARE_EXAMPLES[0].id);
  const dBefore = useDeferredValue(before);
  const dAfter = useDeferredValue(after);
  const pb = useMemo(() => parse(dBefore), [dBefore]);
  const pa = useMemo(() => parse(dAfter), [dAfter]);

  const result = useMemo(() => {
    if (pb.ok !== true || pa.ok !== true) return null;
    const b = infer(normalizePayload(pb.value));
    const a = infer(normalizePayload(pa.value));
    const changes = diff(b, a);
    return { changes, after: toContract(a), afterShape: a, severity: maxSeverity(changes) };
  }, [pb, pa]);

  const condition = conditionForSeverity(result?.severity);
  const counts = result
    ? (['breaking', 'risky', 'info'] as Severity[]).map((s) => ({ s, n: result.changes.filter((c) => c.severity === s).length })).filter((x) => x.n > 0)
    : [];
  const activeExample = COMPARE_EXAMPLES.find((e) => e.id === active);

  return (
    <div>
      <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Examples">
        {COMPARE_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            className="chip"
            aria-pressed={active === ex.id}
            onClick={() => {
              setActive(ex.id);
              setBefore(pretty(ex.before));
              setAfter(pretty(ex.after));
            }}
          >
            {ex.title}
          </button>
        ))}
      </div>
      {activeExample && <p className="mt-3 text-sm text-ink-3">{activeExample.blurb}</p>}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Editor
          id="pg-before"
          label="Before (baseline)"
          value={before}
          onChange={(v) => {
            setBefore(v);
            setActive('');
          }}
          parsed={pb}
        />
        <Editor
          id="pg-after"
          label="After (observed)"
          value={after}
          onChange={(v) => {
            setAfter(v);
            setActive('');
          }}
          parsed={pa}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn py-1.5 text-xs"
          onClick={() => {
            setBefore(after);
            setAfter(before);
            setActive('');
          }}
        >
          Swap sides
        </button>
        <button
          type="button"
          className="btn py-1.5 text-xs"
          onClick={() => {
            setBefore('');
            setAfter('');
            setActive('');
          }}
        >
          Clear
        </button>
      </div>

      <section aria-labelledby="report-heading" aria-live="polite" className="panel mt-8 p-4 sm:p-6">
        {!result ? (
          <p className="text-sm text-ink-3" id="report-heading">
            Paste valid JSON on both sides to see a drift report.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Glyph condition={condition} size={64} />
              <div className="min-w-0 flex-1">
                <h3 id="report-heading" className={`font-serif text-3xl italic leading-none ${CONDITION_TEXT[condition]}`}>
                  {CONDITION_META[condition].label}
                </h3>
                <p className="mt-2 text-sm text-ink-2">
                  {result.changes.length === 0
                    ? 'Same shape on both sides. Values may differ; the contract does not.'
                    : `${result.changes.length} change${result.changes.length === 1 ? '' : 's'} between the two payloads.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {counts.map(({ s, n }) => (
                  <SeverityChip key={s} severity={s} count={n} />
                ))}
              </div>
            </div>
            {result.changes.length > 0 && (
              <ul className="mt-5 border-t border-line">
                {result.changes.map((c, i) => (
                  <ChangeRow key={`${c.path}-${c.kind}-${i}`} change={c} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {result && (
        <section aria-labelledby="after-heading" className="mt-8">
          <h3 id="after-heading" className="mb-3 font-serif text-2xl text-ink">
            Contract of the observed payload
          </h3>
          <TypesTabs contract={result.after} shape={result.afterShape} name="Observed" />
        </section>
      )}
    </div>
  );
}

function HarImporter() {
  const [result, setResult] = useState<HarImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = (text: string, name: string) => {
    try {
      const har = JSON.parse(text);
      const r = importHar(har);
      setResult(r);
      setSelected(0);
      setError(r.endpoints.length ? null : 'No JSON responses found in this HAR. Export it with "Save all as HAR with content".');
      setFileName(name);
    } catch (err) {
      setResult(null);
      setError(`Could not read ${name}: ${(err as Error).message}`);
    }
  };

  const onFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) {
      setError('That HAR is over 60 MB. Record a shorter session.');
      return;
    }
    ingest(await f.text(), f.name);
  };

  const loadExample = async () => {
    const res = await fetch(siteUrl('examples/sample.har'));
    ingest(await res.text(), 'sample.har');
  };

  const endpoint = result?.endpoints[selected];
  const typeName = (key: string) =>
    key
      .split(' ')[2]
      ?.split('/')
      .filter((s) => s && !s.startsWith(':'))
      .slice(-2)
      .join(' ') || 'Response';

  const downloadAll = (kind: 'ts' | 'zod') => {
    if (!result) return;
    const parts = result.endpoints.map((e) => `// ${e.key} (${e.samples} sample${e.samples === 1 ? '' : 's'})\n${kind === 'ts' ? toTypeScript(e.shape, typeName(e.key)) : toZod(e.shape, typeName(e.key)).replace("import { z } from 'zod';\n\n", '')}`);
    const text = kind === 'ts' ? parts.join('\n') : `import { z } from 'zod';\n\n${parts.join('\n')}`;
    downloadText(kind === 'ts' ? 'api-contracts.ts' : 'api-schemas.ts', text, 'text/plain');
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-accent bg-accent/10' : 'border-line-strong bg-panel'}`}
      >
        <Icon name="upload" size={28} className="text-ink-3" />
        <p className="mt-3 font-serif text-2xl text-ink">Drop a HAR file</p>
        <p className="mt-1 max-w-md text-sm text-ink-2">
          In DevTools: Network tab, right-click, “Save all as HAR with content”. Parsed entirely in your browser; only JSON response shapes are kept.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            Choose a file
          </button>
          <button type="button" className="btn" onClick={() => void loadExample()}>
            Load example HAR
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".har,.json,application/json" className="sr-only" aria-label="HAR file" onChange={(e) => void onFiles(e.target.files)} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-storm/30 bg-storm/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {result && result.endpoints.length > 0 && endpoint && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-ink-3">
              {fileName}: {result.totalEntries} entries · {result.endpoints.length} JSON endpoint{result.endpoints.length === 1 ? '' : 's'} · {result.skipped} skipped
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn py-1.5 text-xs" onClick={() => downloadAll('ts')}>
                <Icon name="download" size={13} /> All as TypeScript
              </button>
              <button type="button" className="btn py-1.5 text-xs" onClick={() => downloadAll('zod')}>
                <Icon name="download" size={13} /> All as Zod
              </button>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-risky">
              {result.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <ul className="panel scroll-thin max-h-[32rem] overflow-auto p-2" aria-label="Endpoints">
              {result.endpoints.map((e, i) => (
                <li key={e.key}>
                  <button
                    type="button"
                    aria-current={i === selected}
                    onClick={() => setSelected(i)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${i === selected ? 'bg-panel-2' : 'hover:bg-panel-2/60'}`}
                  >
                    <span className="block truncate font-mono text-[0.72rem] text-ink">
                      <span className="text-accent">{e.method}</span> {e.path}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[0.65rem] text-ink-3">
                      {e.host} · {e.status} · {e.samples} sample{e.samples === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="panel min-w-0 p-4 sm:p-5">
              <p className="mb-4 break-all font-mono text-xs text-ink-2">{endpoint.key}</p>
              <TypesTabs key={endpoint.key} contract={endpoint.contract} shape={endpoint.shape} name={typeName(endpoint.key)} />
            </div>
          </div>
        </div>
      )}
      {!result && !error && (
        <div className="mt-8">
          <EmptyState title="Contracts from real traffic" glyph={<Glyph condition="partly-cloudy" size={56} title={false} />}>
            A HAR file is a recording of every request your browser made. Driftwatch groups the JSON responses by endpoint (ids in paths become <code className="font-mono">:id</code>), merges
            every sample and writes the contract, TypeScript interfaces and Zod schemas.
          </EmptyState>
        </div>
      )}
    </div>
  );
}

export default function Playground() {
  useDocumentTitle('Playground');
  const [mode, setMode] = useState<'compare' | 'har'>('compare');
  return (
    <>
      <header className="max-w-3xl">
        <p className="kicker">Playground</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-ink sm:text-6xl">
          See drift <span className="italic text-accent">before it rains</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          The same engine the monitor uses, running in your browser. Compare two payloads for a live drift report, or turn a HAR recording into contracts and types. Nothing is uploaded.
        </p>
      </header>
      <div className="mt-10">
        <SectionHeading title={mode === 'compare' ? 'Compare two payloads' : 'HAR → contract'}>
          <Tabs
            label="Playground mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'compare', label: 'JSON vs JSON' },
              { value: 'har', label: 'HAR → contract' },
            ]}
          />
        </SectionHeading>
        <div role="tabpanel">{mode === 'compare' ? <Compare /> : <HarImporter />}</div>
      </div>
    </>
  );
}
