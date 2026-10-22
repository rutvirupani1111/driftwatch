import { useMemo, useState } from 'react';
import { countFields, type ContractNode } from '../lib/drift';
import { isMapKey } from '../lib/normalize';
import { Icon } from './ui';

const TYPE_COLOR: Record<string, string> = {
  string: 'var(--ok)',
  integer: 'var(--info)',
  number: 'var(--info)',
  boolean: 'var(--accent)',
  null: 'var(--ink-3)',
  object: 'var(--ink-2)',
  array: 'var(--ink-2)',
  union: 'var(--risky)',
  unknown: 'var(--ink-3)',
};

interface Child {
  key: string;
  label: string;
  node: ContractNode;
  kind: 'prop' | 'items' | 'variant';
}

function childrenOf(node: ContractNode): Child[] {
  if (node.type === 'object') return Object.entries(node.properties ?? {}).map(([k, v]) => ({ key: k, label: k, node: v, kind: 'prop' as const }));
  if (node.type === 'array' && node.items && hasChildren(node.items)) return childrenOf(node.items).map((c) => ({ ...c, key: `[]${c.key}` }));
  if (node.type === 'union') {
    return (node.anyOf ?? [])
      .filter((v) => hasChildren(v))
      .map((v, i) => ({ key: `|${i}`, label: `as ${v.type}`, node: v, kind: 'variant' as const }));
  }
  return [];
}

function hasChildren(node: ContractNode): boolean {
  if (node.type === 'object') return Object.keys(node.properties ?? {}).length > 0;
  if (node.type === 'array') return !!node.items && hasChildren(node.items);
  if (node.type === 'union') return (node.anyOf ?? []).some(hasChildren);
  return false;
}

function TypeBadge({ node }: { node: ContractNode }) {
  const parts: Array<{ text: string; color: string }> = [];
  const push = (n: ContractNode, suffix = '') => {
    if (n.type === 'array') {
      const inner = n.items ? (n.items.type === 'union' ? (n.items.anyOf ?? []).map((v) => v.type).join('|') : n.items.type) : 'empty';
      parts.push({ text: `${inner}[]${suffix}`, color: TYPE_COLOR.array });
    } else if (n.type === 'object') {
      const keys = Object.keys(n.properties ?? {});
      const map = keys.length === 1 && isMapKey(keys[0]);
      parts.push({ text: map ? `map${suffix}` : `object${suffix}`, color: TYPE_COLOR.object });
    } else if (n.type === 'union') {
      (n.anyOf ?? []).forEach((v) => push(v));
    } else {
      parts.push({ text: n.type, color: TYPE_COLOR[n.type] ?? 'var(--ink-2)' });
    }
  };
  push(node);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mr-1 text-ink-3">|</span>}
          <span className="font-mono text-[0.75rem]" style={{ color: p.color }}>
            {p.text}
          </span>
        </span>
      ))}
      {node.type === 'string' && node.format && (
        <span className="rounded-md border border-line px-1.5 py-px font-mono text-[0.65rem] text-ink-2" title={`Detected string format: ${node.format}`}>
          {node.format}
        </span>
      )}
      {node.enum && (
        <span className="rounded-md border border-line px-1.5 py-px font-mono text-[0.65rem] text-ink-2" title={node.enum.join(', ')}>
          enum({node.enum.length})
        </span>
      )}
      {node.nullable && (
        <span className="rounded-md border border-line px-1.5 py-px font-mono text-[0.65rem] text-ink-3" title="null has also been observed here">
          nullable
        </span>
      )}
    </span>
  );
}

function matches(child: Child, query: string): boolean {
  if (child.label.toLowerCase().includes(query)) return true;
  return childrenOf(child.node).some((c) => matches(c, query));
}

function Row({ child, depth, expandDepth, version, query }: { child: Child; depth: number; expandDepth: number; version: number; query: string }) {
  const kids = childrenOf(child.node);
  const [openState, setOpen] = useState<{ v: number; open: boolean } | null>(null);
  const open = query ? true : openState && openState.v === version ? openState.open : depth < expandDepth;
  const visibleKids = query ? kids.filter((k) => matches(k, query)) : kids;
  const map = isMapKey(child.label);
  const isArray = child.node.type === 'array';
  const label = (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className={`font-mono text-[0.8rem] ${map ? 'italic text-accent' : child.kind === 'variant' ? 'italic text-ink-3' : 'text-ink'} ${
          query && child.label.toLowerCase().includes(query) ? 'rounded bg-accent/20 px-0.5' : ''
        }`}
        title={map ? 'Dynamic keys (dates, versions, ids) collapsed into one entry' : undefined}
      >
        {child.label}
        {isArray && kids.length > 0 && <span className="text-ink-3">[]</span>}
        {child.node.optional && (
          <span className="text-risky" title="Optional: missing from some observed responses">
            ?
          </span>
        )}
      </span>
      <TypeBadge node={child.node} />
    </span>
  );
  return (
    <li>
      {kids.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen({ v: version, open: !open })}
          className="group flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-panel-2"
        >
          <Icon name="chevron" size={14} className={`mt-0.5 text-ink-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          {label}
          {!open && <span className="ml-auto pl-2 font-mono text-[0.68rem] text-ink-3">{countFields(child.node)}</span>}
        </button>
      ) : (
        <div className="flex items-start gap-1.5 px-1.5 py-1">
          <span className="w-3.5" aria-hidden="true" />
          {label}
        </div>
      )}
      {kids.length > 0 && open && (
        <ul className="ml-[0.95rem] border-l border-line pl-2">
          {visibleKids.map((k) => (
            <Row key={k.key} child={k} depth={depth + 1} expandDepth={expandDepth} version={version} query={query} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Collapsible view of an inferred contract: types, formats, optional and nullable markers. */
export function ContractTree({ contract, defaultDepth = 1 }: { contract: ContractNode; defaultDepth?: number }) {
  const [expandDepth, setExpandDepth] = useState(defaultDepth);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const root: Child = useMemo(() => ({ key: '$', label: '$', node: contract, kind: 'prop' }), [contract]);
  const total = useMemo(() => countFields(contract), [contract]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">Filter fields</span>
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field pl-8" placeholder={`Filter ${total} fields`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn py-1.5 text-xs"
          onClick={() => {
            setExpandDepth(99);
            setVersion((v) => v + 1);
          }}
        >
          Expand all
        </button>
        <button
          type="button"
          className="btn py-1.5 text-xs"
          onClick={() => {
            setExpandDepth(1);
            setVersion((v) => v + 1);
          }}
        >
          Collapse
        </button>
      </div>
      <ul className="code-surface scroll-thin max-h-[34rem] overflow-auto p-2" aria-label="Inferred contract">
        <Row child={root} depth={0} expandDepth={expandDepth} version={version} query={query} />
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>
          <span className="font-mono text-risky">?</span> optional (missing from some responses)
        </span>
        <span>
          <span className="font-mono italic text-accent">&lt;key&gt;</span> dynamic keys collapsed
        </span>
        <span>Only shapes are stored, never values.</span>
      </p>
    </div>
  );
}
