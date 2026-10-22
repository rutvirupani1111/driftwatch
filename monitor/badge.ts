import { relativeTime } from '../src/lib/format';
import type { ApiLatest } from '../src/lib/types';
import { escapeXml } from './feed';

export interface BadgeState {
  label: string;
  message: string;
  color: string;
}

export const BADGE_COLORS = {
  stable: '#3fb950',
  changed: '#2f81f7',
  risky: '#d29922',
  breaking: '#e5534b',
  unknown: '#8b949e',
} as const;

/** "schema: stable" / "schema: changed 2d ago" / "schema: breaking 1h ago" / "schema: unreachable" */
export function badgeState(latest: Pick<ApiLatest, 'ok' | 'weather' | 'lastChange' | 'fingerprint'>, now: number): BadgeState {
  const label = 'schema';
  if (!latest.fingerprint) return { label, message: latest.ok ? 'learning' : 'unreachable', color: BADGE_COLORS.unknown };
  if (!latest.ok) return { label, message: 'unreachable', color: BADGE_COLORS.unknown };
  const change = latest.lastChange;
  const condition = latest.weather.condition;
  if (condition === 'storm' && change) {
    return { label, message: `breaking ${relativeTime(change.at, now)}`, color: BADGE_COLORS.breaking };
  }
  if (condition === 'partly-cloudy' && change) {
    return {
      label,
      message: `changed ${relativeTime(change.at, now)}`,
      color: change.severity === 'risky' ? BADGE_COLORS.risky : BADGE_COLORS.changed,
    };
  }
  return { label, message: 'stable', color: BADGE_COLORS.stable };
}

/** Approximate Verdana 11px advance widths (shields.io metrics, rounded). */
function charWidth(ch: string): number {
  if (ch === ' ') return 3.9;
  if ('iIjl.,:;|!\'`'.includes(ch)) return 3.4;
  if ('ftr()[]{}-/\\'.includes(ch)) return 4.6;
  if ('mwMW%'.includes(ch)) return 10.5;
  if (/[A-Z]/.test(ch)) return 7.6;
  if (/[0-9]/.test(ch)) return 7;
  return 6.6;
}

export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return Math.round(w);
}

/** Flat, shields.io-style SVG badge. */
export function renderBadge(state: BadgeState): string {
  const pad = 6;
  const lw = textWidth(state.label) + pad * 2;
  const mw = textWidth(state.message) + pad * 2;
  const w = lw + mw;
  const label = escapeXml(state.label);
  const message = escapeXml(state.message);
  const title = `${label}: ${message}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}">
  <title>${title}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#2b3245"/>
    <rect x="${lw}" width="${mw}" height="20" fill="${state.color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + mw / 2}" y="15" fill="#010101" fill-opacity=".3">${message}</text>
    <text x="${lw + mw / 2}" y="14">${message}</text>
  </g>
</svg>
`;
}
