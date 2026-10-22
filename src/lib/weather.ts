/**
 * The weather model: one condition per API, derived from contract changes and
 * the latest check. Shared by the monitor (which stores it) and the site.
 *
 *   storm          a breaking change in the last 7 days
 *   fog            the latest check failed (error, timeout, 5xx, not JSON)
 *   partly-cloudy  non-breaking changes (additive / risky) in the last 7 days
 *   sunny          stable for the whole 7-day window and responding normally
 *
 * Precedence: fog > storm > partly-cloudy > sunny. When an API is unreachable
 * right now, that is the most useful thing to say; a recent breaking change is
 * still mentioned in the reason.
 */

import type { Severity } from './drift';

export type Condition = 'sunny' | 'partly-cloudy' | 'storm' | 'fog';

export const CONDITIONS: Condition[] = ['storm', 'fog', 'partly-cloudy', 'sunny'];

export const WINDOW_DAYS = 7;
const DAY = 86_400_000;

export interface ConditionMeta {
  label: string;
  short: string;
  singular: string;
  plural: string;
  blurb: string;
}

export const CONDITION_META: Record<Condition, ConditionMeta> = {
  sunny: {
    label: 'Clear skies',
    short: 'Clear',
    singular: 'clear sky',
    plural: 'clear skies',
    blurb: 'No contract changes in the last 7 days and responding normally.',
  },
  'partly-cloudy': {
    label: 'Partly cloudy',
    short: 'Cloudy',
    singular: 'partly cloudy',
    plural: 'partly cloudy',
    blurb: 'Non-breaking drift in the last 7 days: new fields, nullability or format changes.',
  },
  storm: {
    label: 'Storm',
    short: 'Storm',
    singular: 'storm',
    plural: 'storms',
    blurb: 'A breaking change landed in the last 7 days: a field vanished or changed type.',
  },
  fog: {
    label: 'Fog',
    short: 'Fog',
    singular: 'fog bank',
    plural: 'fog banks',
    blurb: 'The latest check failed: an error, a timeout, a 5xx or a body that was not JSON.',
  },
};

export interface Weather {
  condition: Condition;
  /** short label for the condition, e.g. "Storm" */
  headline: string;
  /** one sentence explaining why */
  reason: string;
  /** ISO time the relevant event happened (change time, stable-since) */
  since?: string;
}

export interface WeatherEvent {
  at: string;
  severity: Severity;
  summary?: string;
}

export interface WeatherInput {
  now: number | Date;
  ok: boolean;
  status?: number;
  error?: { code: string; message: string } | null;
  events: WeatherEvent[];
  firstSeenAt?: string;
}

function ms(t: number | Date | string): number {
  return typeof t === 'number' ? t : new Date(t).getTime();
}

/** Classifies one API. Pure: the same input always gives the same weather. */
export function classifyWeather(input: WeatherInput): Weather {
  const now = ms(input.now);
  const recent = input.events
    .filter((e) => now - ms(e.at) <= WINDOW_DAYS * DAY && ms(e.at) <= now + 60_000)
    .sort((a, b) => ms(b.at) - ms(a.at));
  const breaking = recent.find((e) => e.severity === 'breaking');

  if (!input.ok) {
    const what = input.error?.message ?? (input.status ? `HTTP ${input.status}` : 'Request failed');
    return {
      condition: 'fog',
      headline: CONDITION_META.fog.label,
      reason: breaking ? `${what}. A breaking change also landed this week.` : `${what}.`,
      since: undefined,
    };
  }
  if (breaking) {
    return {
      condition: 'storm',
      headline: CONDITION_META.storm.label,
      reason: breaking.summary ?? 'Breaking contract change in the last 7 days.',
      since: breaking.at,
    };
  }
  if (recent.length > 0) {
    const latest = recent[0];
    return {
      condition: 'partly-cloudy',
      headline: CONDITION_META['partly-cloudy'].label,
      reason: latest.summary ?? 'Non-breaking contract changes in the last 7 days.',
      since: latest.at,
    };
  }
  const lastEvent = input.events.map((e) => e.at).sort().at(-1);
  const since = lastEvent ?? input.firstSeenAt;
  return {
    condition: 'sunny',
    headline: CONDITION_META.sunny.label,
    reason: 'Contract unchanged and responding normally.',
    since,
  };
}

/** "3 storms, 2 partly cloudy and 18 clear skies" */
export function forecastPhrase(counts: Partial<Record<Condition, number>>): string {
  const parts: string[] = [];
  for (const c of CONDITIONS) {
    const n = counts[c] ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? CONDITION_META[c].singular : CONDITION_META[c].plural}`);
  }
  if (parts.length === 0) return 'No observations yet';
  const total = CONDITIONS.reduce((s, c) => s + (counts[c] ?? 0), 0);
  if (parts.length === 1 && (counts.sunny ?? 0) === total) return `Clear skies across all ${total} APIs`;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** The worst condition among a list (used for grouped glyphs). */
export function worstCondition(list: Condition[]): Condition {
  for (const c of CONDITIONS) if (list.includes(c)) return c;
  return 'sunny';
}

/** Weather for an arbitrary diff (used by the Playground). */
export function conditionForSeverity(severity: Severity | undefined): Condition {
  if (severity === 'breaking') return 'storm';
  if (severity) return 'partly-cloudy';
  return 'sunny';
}
