import { describe, expect, it } from 'vitest';
import { classifyWeather, conditionForSeverity, forecastPhrase, worstCondition } from '../src/lib/weather';
import { DAY, HOUR } from './helpers';

const NOW = Date.parse('2026-10-23T03:17:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('classifyWeather', () => {
  it('is sunny when stable for the whole window', () => {
    const w = classifyWeather({ now: NOW, ok: true, events: [{ at: ago(8 * DAY), severity: 'breaking' }], firstSeenAt: ago(30 * DAY) });
    expect(w.condition).toBe('sunny');
    expect(w.since).toBe(ago(8 * DAY));
  });

  it('is sunny on first observation, stable since first seen', () => {
    const w = classifyWeather({ now: NOW, ok: true, events: [], firstSeenAt: ago(HOUR) });
    expect(w).toMatchObject({ condition: 'sunny', since: ago(HOUR) });
  });

  it('is partly cloudy after additive or risky changes', () => {
    expect(classifyWeather({ now: NOW, ok: true, events: [{ at: ago(2 * DAY), severity: 'info', summary: 'New field' }] })).toMatchObject({
      condition: 'partly-cloudy',
      reason: 'New field',
    });
    expect(classifyWeather({ now: NOW, ok: true, events: [{ at: ago(6 * DAY), severity: 'risky' }] }).condition).toBe('partly-cloudy');
  });

  it('is stormy after a breaking change within 7 days, even with later info changes', () => {
    const w = classifyWeather({
      now: NOW,
      ok: true,
      events: [
        { at: ago(3 * DAY), severity: 'breaking', summary: '$.license was removed' },
        { at: ago(1 * DAY), severity: 'info' },
      ],
    });
    expect(w).toMatchObject({ condition: 'storm', reason: '$.license was removed', since: ago(3 * DAY) });
  });

  it('is foggy when the latest check failed, and still mentions a storm', () => {
    const w = classifyWeather({ now: NOW, ok: false, status: 503, error: { code: 'http_503', message: 'HTTP 503' }, events: [{ at: ago(DAY), severity: 'breaking' }] });
    expect(w.condition).toBe('fog');
    expect(w.reason).toContain('HTTP 503');
    expect(w.reason).toContain('breaking');
  });

  it('treats the 7-day boundary inclusively', () => {
    expect(classifyWeather({ now: NOW, ok: true, events: [{ at: ago(7 * DAY), severity: 'breaking' }] }).condition).toBe('storm');
    expect(classifyWeather({ now: NOW, ok: true, events: [{ at: ago(7 * DAY + 1000), severity: 'breaking' }] }).condition).toBe('sunny');
  });
});

describe('phrases and helpers', () => {
  it('builds the forecast headline', () => {
    expect(forecastPhrase({ storm: 3, sunny: 18 })).toBe('3 storms and 18 clear skies');
    expect(forecastPhrase({ storm: 1, fog: 2, 'partly-cloudy': 1, sunny: 21 })).toBe('1 storm, 2 fog banks, 1 partly cloudy and 21 clear skies');
    expect(forecastPhrase({ sunny: 25 })).toBe('Clear skies across all 25 APIs');
    expect(forecastPhrase({})).toBe('No observations yet');
  });

  it('ranks conditions and maps severities', () => {
    expect(worstCondition(['sunny', 'fog', 'partly-cloudy'])).toBe('fog');
    expect(worstCondition(['sunny', 'storm', 'fog'])).toBe('storm');
    expect(conditionForSeverity('breaking')).toBe('storm');
    expect(conditionForSeverity('info')).toBe('partly-cloudy');
    expect(conditionForSeverity(undefined)).toBe('sunny');
  });
});
