import { formatMs } from '../src/lib/format';
import { CONDITION_META, forecastPhrase } from '../src/lib/weather';
import type { RunSummary } from './pipeline';

/** Markdown for `$GITHUB_STEP_SUMMARY`. */
export function stepSummary(run: RunSummary): string {
  const { index } = run;
  const lines: string[] = [];
  lines.push(`## Driftwatch forecast: ${forecastPhrase(index.counts)}`);
  lines.push('');
  lines.push(`Checked ${run.results.length} API${run.results.length === 1 ? '' : 's'} in ${formatMs(run.durationMs)} · ${run.events.length} new contract change event${run.events.length === 1 ? '' : 's'} · data ${run.changed ? 'changed (will commit)' : 'unchanged (no commit)'}`);
  lines.push('');
  if (run.events.length) {
    lines.push('### New changes');
    lines.push('');
    for (const e of run.events) {
      lines.push(`- **${e.severity}** ${e.apiName}: ${e.summary}`);
      for (const c of e.changes.slice(0, 8)) lines.push(`  - \`${c.path}\` ${c.message}${c.before || c.after ? ` (\`${c.before ?? 'missing'}\` → \`${c.after ?? 'missing'}\`)` : ''}`);
    }
    lines.push('');
  }
  lines.push('| API | Weather | Status | Latency | Note |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of run.results) {
    const note = r.event ? `${r.event.severity}: ${r.event.summary}` : (r.error ?? (r.isNew ? 'first observation' : ''));
    lines.push(`| ${r.name} | ${CONDITION_META[r.condition].label} | ${r.status || '—'} | ${formatMs(r.latencyMs)} | ${note.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}
