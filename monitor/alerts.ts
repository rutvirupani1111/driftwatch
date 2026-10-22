import type { ChangeEvent } from '../src/lib/types';
import type { FetchLike } from './fetcher';

export interface AlertTarget {
  kind: 'discord' | 'slack';
  url: string;
}

const COLORS = { breaking: 0xe5534b, risky: 0xd29922, info: 0x2f81f7 } as const;
const MAX_EVENTS = 10;

/** Alert targets configured through environment variables (GitHub Secrets in CI). */
export function alertTargets(env: Record<string, string | undefined>): AlertTarget[] {
  const out: AlertTarget[] = [];
  if (env.DISCORD_WEBHOOK_URL) out.push({ kind: 'discord', url: env.DISCORD_WEBHOOK_URL });
  if (env.SLACK_WEBHOOK_URL) out.push({ kind: 'slack', url: env.SLACK_WEBHOOK_URL });
  return out;
}

/** Only breaking and risky changes are worth waking someone up for. */
export function alertableEvents(events: ChangeEvent[]): ChangeEvent[] {
  return events.filter((e) => e.severity === 'breaking' || e.severity === 'risky').slice(0, MAX_EVENTS);
}

function eventUrl(siteUrl: string, e: ChangeEvent): string {
  return `${siteUrl}api/${e.apiId}#${encodeURIComponent(e.id)}`;
}

function lines(e: ChangeEvent, max = 6): string[] {
  const out = e.changes.slice(0, max).map((c) => `• [${c.severity}] ${c.message}${c.before || c.after ? ` (${c.before ?? 'missing'} → ${c.after ?? 'missing'})` : ''}`);
  if (e.changes.length > max) out.push(`• …and ${e.changes.length - max} more`);
  return out;
}

export function discordPayload(events: ChangeEvent[], siteUrl: string): unknown {
  return {
    username: 'Driftwatch',
    content: `${events.length} API contract change${events.length === 1 ? '' : 's'} detected`,
    embeds: events.slice(0, 10).map((e) => ({
      title: `${e.severity.toUpperCase()}: ${e.apiName}`.slice(0, 256),
      url: eventUrl(siteUrl, e),
      description: [e.summary, '', ...lines(e)].join('\n').slice(0, 4000),
      color: COLORS[e.severity],
      timestamp: e.at,
      footer: { text: `fingerprint ${e.fingerprintBefore} → ${e.fingerprintAfter}` },
    })),
  };
}

export function slackPayload(events: ChangeEvent[], siteUrl: string): unknown {
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `Driftwatch: ${events.length} API contract change${events.length === 1 ? '' : 's'}` } },
  ];
  for (const e of events) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [`*${e.severity.toUpperCase()}* <${eventUrl(siteUrl, e)}|${e.apiName}>: ${e.summary}`, ...lines(e)].join('\n').slice(0, 2900),
      },
    });
  }
  return { text: `Driftwatch: ${events.map((e) => `${e.severity} change in ${e.apiName}`).join('; ')}`, blocks };
}

export interface AlertResult {
  target: AlertTarget['kind'];
  ok: boolean;
  status?: number;
  error?: string;
}

/** Posts alerts; failures are reported, never thrown. */
export async function sendAlerts(
  events: ChangeEvent[],
  opts: { env: Record<string, string | undefined>; fetch: FetchLike; siteUrl: string; timeoutMs?: number },
): Promise<AlertResult[]> {
  const targets = alertTargets(opts.env);
  const toSend = alertableEvents(events);
  if (!targets.length || !toSend.length) return [];
  const results: AlertResult[] = [];
  for (const t of targets) {
    const payload = t.kind === 'discord' ? discordPayload(toSend, opts.siteUrl) : slackPayload(toSend, opts.siteUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await opts.fetch(t.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      results.push({ target: t.kind, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({ target: t.kind, ok: false, error: (err as Error).message });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}
