import { describe, expect, it } from 'vitest';
import { badgeState, BADGE_COLORS, renderBadge, textWidth } from '../monitor/badge';
import { atomFeed, escapeXml } from '../monitor/feed';
import type { ChangeEvent } from '../src/lib/types';
import { DAY, HOUR } from './helpers';

const NOW = Date.parse('2026-10-23T03:17:00Z');

const event = (id: string, at: string, severity: ChangeEvent['severity'] = 'breaking'): ChangeEvent => ({
  id,
  apiId: 'demo',
  apiName: 'Demo <API> & "friends"',
  at,
  severity,
  summary: '$.name was removed',
  fingerprintBefore: 'aaaa',
  fingerprintAfter: 'bbbb',
  changes: [{ path: '$.name', kind: 'field-removed', severity, message: '$.name was removed', before: 'string', after: undefined }],
});

describe('atom feed', () => {
  it('escapes XML and orders entries newest first', () => {
    const xml = atomFeed({
      id: 'https://example.com/feed.xml',
      title: 'Driftwatch & co',
      selfUrl: 'https://example.com/feed.xml',
      alternateUrl: 'https://example.com/',
      generatedAt: '2026-10-23T03:17:00.000Z',
      events: [event('demo@1', '2026-10-20T00:00:00.000Z'), event('demo@2', '2026-10-22T00:00:00.000Z', 'info')],
      linkFor: (e) => `https://example.com/api/${e.apiId}#${e.id}`,
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<title>Driftwatch &amp; co</title>');
    expect(xml).toContain('Demo &lt;API&gt; &amp; &quot;friends&quot;');
    expect(xml).toContain('<updated>2026-10-22T00:00:00.000Z</updated>');
    expect(xml.indexOf('demo@2')).toBeLessThan(xml.indexOf('demo@1'));
    expect(xml.match(/<entry>/g)).toHaveLength(2);
    expect(xml).not.toMatch(/<[^>]*\s&\s/);
  });

  it('is valid with no entries', () => {
    const xml = atomFeed({ id: 'x', title: 't', selfUrl: 's', alternateUrl: 'a', generatedAt: '2026-10-23T03:17:00.000Z', events: [], linkFor: () => '' });
    expect(xml).toContain('<updated>2026-10-23T03:17:00.000Z</updated>');
    expect(xml).not.toContain('<entry>');
  });

  it('strips control characters', () => {
    expect(escapeXml('a\u0001b<')).toBe('ab&lt;');
  });
});

describe('badges', () => {
  const base = { ok: true, fingerprint: 'abc' };

  it('says stable, changed or breaking with relative times', () => {
    expect(badgeState({ ...base, weather: { condition: 'sunny', headline: '', reason: '' } }, NOW)).toEqual({ label: 'schema', message: 'stable', color: BADGE_COLORS.stable });
    const changed = badgeState(
      { ...base, weather: { condition: 'partly-cloudy', headline: '', reason: '' }, lastChange: { id: 'x', at: new Date(NOW - 2 * DAY).toISOString(), severity: 'info', summary: '' } },
      NOW,
    );
    expect(changed).toEqual({ label: 'schema', message: 'changed 2d ago', color: BADGE_COLORS.changed });
    const breaking = badgeState(
      { ...base, weather: { condition: 'storm', headline: '', reason: '' }, lastChange: { id: 'x', at: new Date(NOW - HOUR).toISOString(), severity: 'breaking', summary: '' } },
      NOW,
    );
    expect(breaking).toEqual({ label: 'schema', message: 'breaking 1h ago', color: BADGE_COLORS.breaking });
    expect(badgeState({ ok: false, fingerprint: 'abc', weather: { condition: 'fog', headline: '', reason: '' } }, NOW).message).toBe('unreachable');
    expect(badgeState({ ok: true, weather: { condition: 'sunny', headline: '', reason: '' } }, NOW).message).toBe('learning');
  });

  it('renders an accessible SVG sized to its text', () => {
    const svg = renderBadge({ label: 'schema', message: 'breaking 1h ago', color: '#e5534b' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="schema: breaking 1h ago"');
    expect(svg).toContain('fill="#e5534b"');
    const width = Number(svg.match(/width="(\d+)"/)?.[1]);
    expect(width).toBe(textWidth('schema') + textWidth('breaking 1h ago') + 24);
  });
});
