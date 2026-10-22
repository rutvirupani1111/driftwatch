import type { ReactNode } from 'react';
import { Link } from 'react-router';
import ourConfig from '../../driftwatch.config.json';
import { Glyph } from '../components/Glyph';
import { API_DRIFT_URL, REPO_URL } from '../components/Layout';
import { CONDITION_TEXT, SectionHeading, SeverityChip } from '../components/ui';
import { ENGINE, ENGINE_LABEL } from '../lib/drift';
import { useDocumentTitle } from '../lib/hooks';
import { CONDITION_META, CONDITIONS } from '../lib/weather';

const STEPS = [
  { title: 'Every 3 hours', sub: ['Actions cron', 'at :17'] },
  { title: 'Call each API', sub: ['once per run', '15 s timeout'] },
  { title: 'Infer the shape', sub: ['api-drift', 'values dropped'] },
  { title: 'Diff contracts', sub: ['vs what we learned', 'severity + weather'] },
  { title: 'Write it down', sub: ['data/ in git', 'commit on change'] },
  { title: 'Publish', sub: ['GitHub Pages', 'site + data'] },
];
/** Outputs, each hanging under the step that produces it. */
const OUTPUTS = [
  { title: 'Webhooks', sub: ['Slack · Discord'], under: 3 },
  { title: 'Atom feeds', sub: ['global + per API'], under: 4 },
  { title: 'SVG badges', sub: ['for your README'], under: 5 },
];

function Node({ x, y, w, h, title, sub, accent = false }: { x: number; y: number; w: number; h: number; title: string; sub: string[]; accent?: boolean }) {
  const top = y + h / 2 - (sub.length * 13) / 2 - 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="14" style={{ fill: 'var(--panel-2)', stroke: accent ? 'var(--accent)' : 'var(--line-strong)' }} />
      <text x={x + w / 2} y={top} textAnchor="middle" className="fill-ink text-[13px] font-semibold">
        {title}
      </text>
      {sub.map((line, i) => (
        <text key={line} x={x + w / 2} y={top + 17 + i * 13} textAnchor="middle" className="fill-ink-3 font-mono text-[10px]">
          {line}
        </text>
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, dashed = false }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: 'var(--ink-3)' }} strokeWidth="1.4" strokeDasharray={dashed ? '4 4' : undefined} markerEnd="url(#arrow)" />;
}

function Diagram() {
  const desc =
    'A GitHub Actions schedule runs every three hours. It calls each API once, infers the response shape with api-drift, diffs it against the learned contract, writes data files, commits only when something changed, and publishes the site, Atom feeds, badges and webhooks.';
  const defs = (
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--ink-3)' }} />
      </marker>
    </defs>
  );
  const w = 136;
  const gap = 16;
  const x = (i: number) => 6 + i * (w + gap);
  return (
    <figure className="panel p-4 sm:p-6">
      {/* wide layout */}
      <svg viewBox="0 0 912 262" className="hidden w-full md:block" role="img" aria-label={desc}>
        {defs}
        <text x="8" y="16" className="fill-ink-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          GitHub Actions · every run
        </text>
        {STEPS.map((s, i) => (
          <g key={s.title}>
            <Node x={x(i)} y={28} w={w} h={86} title={s.title} sub={s.sub} accent={i === 2 || i === 3} />
            {i < STEPS.length - 1 && <Arrow x1={x(i) + w + 1} y1={71} x2={x(i + 1) - 2} y2={71} />}
          </g>
        ))}
        <text x="8" y="196" className="fill-ink-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          Outputs
        </text>
        {OUTPUTS.map((o) => (
          <g key={o.title}>
            <Arrow x1={x(o.under) + w / 2} y1={116} x2={x(o.under) + w / 2} y2={182} dashed />
            <Node x={x(o.under) + 8} y={186} w={w - 16} h={62} title={o.title} sub={o.sub} />
          </g>
        ))}
      </svg>
      {/* narrow layout */}
      <svg viewBox="0 0 320 728" className="w-full md:hidden" role="img" aria-label={desc}>
        {defs}
        {STEPS.map((s, i) => (
          <g key={s.title}>
            <Node x={30} y={6 + i * 92} w={260} h={70} title={s.title} sub={s.sub} accent={i === 2 || i === 3} />
            {i < STEPS.length - 1 && <Arrow x1={160} y1={77 + i * 92} x2={160} y2={96 + i * 92} />}
          </g>
        ))}
        {OUTPUTS.map((o, i) => (
          <Node key={o.title} x={4 + i * 106} y={650} w={100} h={62} title={o.title} sub={o.sub} />
        ))}
        <Arrow x1={160} y1={538} x2={54} y2={646} dashed />
        <Arrow x1={160} y1={538} x2={160} y2={646} dashed />
        <Arrow x1={160} y1={538} x2={266} y2={646} dashed />
      </svg>
      <figcaption className="mt-3 text-sm text-ink-3">{desc}</figcaption>
    </figure>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
        {q}
        <span className="font-mono text-ink-3 transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

export default function About() {
  useDocumentTitle('About');
  return (
    <>
      <header className="max-w-3xl">
        <p className="kicker">About</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-ink sm:text-6xl">
          A weather service <span className="italic text-accent">for contracts</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          Third-party APIs change shape without notice: a field disappears, a number becomes a string, nulls start appearing. Your app finds out in production. Driftwatch
          watches from the outside, with nothing but the responses themselves, and keeps the whole history in a git repository.
        </p>
      </header>

      <section aria-labelledby="how-heading" className="mt-16">
        <SectionHeading kicker="How it works" title="Zero infrastructure, all GitHub" id="how-heading" />
        <Diagram />
      </section>

      <section aria-labelledby="model-heading" className="mt-20">
        <SectionHeading kicker="The weather model" title="Four conditions, one rule each" id="model-heading" />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CONDITIONS.map((c) => (
            <li key={c} className="panel p-5">
              <Glyph condition={c} size={56} />
              <h3 className={`mt-3 font-serif text-2xl italic ${CONDITION_TEXT[c]}`}>{CONDITION_META[c].label}</h3>
              <p className="mt-2 text-sm text-ink-2">{CONDITION_META[c].blurb}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-3">
          Fog wins over a storm (an unreachable API is the most urgent thing to know), a storm over cloud, cloud over clear skies. Uptime and p50 / p95 latency are computed over 7
          and 30 days from the same history.
        </p>
        <div className="panel mt-8 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">How changes are classified</caption>
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th scope="col" className="px-5 py-3 font-medium">
                  Severity
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Examples
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              <tr className="border-b border-line">
                <td className="px-5 py-4">
                  <SeverityChip severity="breaking" />
                </td>
                <td className="px-5 py-4">A required field was removed; a type changed (number → string, array → object, object → primitive).</td>
              </tr>
              <tr className="border-b border-line">
                <td className="px-5 py-4">
                  <SeverityChip severity="risky" />
                </td>
                <td className="px-5 py-4">A field became nullable or optional; a string lost its format (date-time → plain text); integers gained fractions; an array came back empty.</td>
              </tr>
              <tr>
                <td className="px-5 py-4">
                  <SeverityChip severity="info" />
                </td>
                <td className="px-5 py-4">A new field appeared; a field that was only ever null now carries a value; a format was gained.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="learning-heading" className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHeading kicker="Learning" title="A contract, not a snapshot" id="learning-heading" />
          <div className="space-y-4 text-ink-2">
            <p>
              Comparing one response with the previous one is noisy: optional fields come and go, and a price of <code className="font-mono text-ink">12</code> is still a
              number. So every response is folded into a learned contract with presence counts. A field seen in every response is required; seen in some, optional.
            </p>
            <p>
              Drift is reported only when the learned contract itself moves, and each surprise is reported once. Objects keyed by data (versions, dates, ids) collapse into a
              single <code className="font-mono italic text-accent">&lt;version&gt;</code> entry, so a new release is not a "new field".
            </p>
          </div>
        </div>
        <div>
          <SectionHeading kicker="Privacy" title="Shapes, never values" id="privacy-heading" />
          <ul className="space-y-3 text-ink-2">
            <li>Responses are reduced to types, formats and optional / nullable markers in memory; the values are dropped before anything is written.</li>
            <li>Secrets live in GitHub Secrets and are substituted only into the outgoing request; a test walks every written file to make sure no secret leaks.</li>
            <li>The Playground and HAR import run entirely in your browser. Nothing is uploaded.</li>
            <li>Shapes can still be sensitive for private APIs: if yours are, keep the repository private and do not publish the dashboard.</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mt-20 max-w-3xl">
        <SectionHeading kicker="FAQ" title="Questions people ask" id="faq-heading" />
        <Faq q="Will this hammer the APIs?">
          <p>No. Each API gets one request per run, eight runs a day, with a User-Agent that links back here. That is less traffic than a single person reading the docs.</p>
        </Faq>
        <Faq q="Why every three hours, at :17?">
          <p>
            Contract changes are rare, so a few checks a day are plenty, and the free Actions minutes go a long way. Off-the-hour schedules avoid the top-of-the-hour rush on
            GitHub's scheduler, which otherwise delays or drops runs.
          </p>
        </Faq>
        <Faq q="Does the repository fill up with commits?">
          <p>
            Data is committed only when a contract fingerprint or a status changes. Between commits the state rides along in the Actions cache, so latency and uptime history is
            never lost.
          </p>
        </Faq>
        <Faq q="Can I watch APIs that need a key?">
          <p>
            Yes: put the key in a repository secret and reference it as <code className="font-mono">{'${NAME}'}</code> in a header, the URL or the body. See{' '}
            <Link className="link" to="/watch-your-own">
              Watch your own
            </Link>
            .
          </p>
        </Faq>
        <Faq q="What engine does the diffing?">
          <p>
            <a className="link" href={API_DRIFT_URL}>
              api-drift
            </a>
            , a zero-dependency library that learns response contracts from real traffic. This build uses: {ENGINE_LABEL} (<code className="font-mono">{ENGINE}</code>).
          </p>
        </Faq>
      </section>

      <section aria-labelledby="credits-heading" className="mt-20">
        <SectionHeading kicker="Credits" title="Standing on public shoulders" id="credits-heading" />
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3 text-ink-2">
            <p>
              Built by Rutvi Rupani. Contract engine:{' '}
              <a className="link" href={API_DRIFT_URL}>
                api-drift
              </a>
              . Type set in Instrument Serif, Inter and JetBrains Mono. MIT licensed;{' '}
              <a className="link" href={REPO_URL}>
                source on GitHub
              </a>
              .
            </p>
            <p>Thank you to every team below for running a free, public API. Driftwatch only reads them politely, and links back to your docs.</p>
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm xs:grid-cols-2">
            {ourConfig.monitors.map((m) => (
              <li key={m.id} className="truncate">
                <a className="link text-ink-2" href={m.docs}>
                  {m.name.split(':')[0]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
