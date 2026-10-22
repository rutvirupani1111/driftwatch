import type { ChangeEvent } from '../src/lib/types';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export interface FeedOptions {
  /** stable feed id (a URL or tag: URI) */
  id: string;
  title: string;
  subtitle?: string;
  /** absolute URL of the feed itself */
  selfUrl: string;
  /** absolute URL of the human page */
  alternateUrl: string;
  /** used for <updated> when there are no entries */
  generatedAt: string;
  events: ChangeEvent[];
  /** absolute URL for an event */
  linkFor: (event: ChangeEvent) => string;
  generatorUri?: string;
}

function entryHtml(event: ChangeEvent): string {
  const items = event.changes
    .slice(0, 25)
    .map((c) => {
      const types = c.before || c.after ? ` <code>${escapeXml(c.before ?? 'missing')}</code> → <code>${escapeXml(c.after ?? 'missing')}</code>` : '';
      return `<li><strong>${c.severity}</strong> ${escapeXml(c.message)}${types}</li>`;
    })
    .join('');
  const more = event.changes.length > 25 ? `<p>…and ${event.changes.length - 25} more.</p>` : '';
  return `<p>${escapeXml(event.summary)}</p><ul>${items}</ul>${more}<p>Fingerprint ${event.fingerprintBefore} → ${event.fingerprintAfter}</p>`;
}

/** Renders an Atom 1.0 feed of contract change events (newest first). */
export function atomFeed(o: FeedOptions): string {
  const events = [...o.events].sort((a, b) => (a.at < b.at ? 1 : -1));
  const updated = events[0]?.at ?? o.generatedAt;
  const entries = events
    .map((e) => {
      const link = o.linkFor(e);
      return [
        '  <entry>',
        `    <title>${escapeXml(`[${e.severity}] ${e.apiName}: ${e.summary}`)}</title>`,
        `    <id>${escapeXml(`${o.id.replace(/feed\.xml$|\.xml$/, '')}#${e.id}`)}</id>`,
        `    <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>`,
        `    <updated>${e.at}</updated>`,
        `    <published>${e.at}</published>`,
        `    <category term="${e.severity}" label="${e.severity}"/>`,
        `    <category term="${escapeXml(e.apiId)}"/>`,
        `    <summary>${escapeXml(e.summary)}</summary>`,
        `    <content type="html">${escapeXml(entryHtml(e))}</content>`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(o.title)}</title>`,
    o.subtitle ? `  <subtitle>${escapeXml(o.subtitle)}</subtitle>` : '',
    `  <id>${escapeXml(o.id)}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(o.selfUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(o.alternateUrl)}"/>`,
    `  <updated>${updated}</updated>`,
    '  <author><name>Driftwatch</name></author>',
    `  <generator uri="${escapeXml(o.generatorUri ?? 'https://github.com/rutvirupani1111/driftwatch')}">Driftwatch</generator>`,
    entries,
    '</feed>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
    .concat('\n');
}
