import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_EVIDENCE_DIR, writeCheckEvidence, type CheckEvidence } from './evidence';
import { isEntrypoint } from './entrypoint';

export const K6_EVIDENCE_NAME = 'perf-k6-journeys';

interface Threshold {
  ok?: boolean;
}

interface Metric {
  values?: Record<string, number>;
  thresholds?: Record<string, Threshold>;
  // k6 1.x handleSummary data keeps the values on the metric itself.
  [key: string]: unknown;
}

function metric(summary: unknown, name: string): Metric | undefined {
  const metrics = (summary as { metrics?: Record<string, Metric> } | null)?.metrics;
  return metrics?.[name];
}

function value(m: Metric | undefined, key: string): number | undefined {
  const nested = m?.values?.[key];
  if (typeof nested === 'number') return nested;
  const flat = m?.[key];
  return typeof flat === 'number' ? flat : undefined;
}

function thresholdsOf(m: Metric | undefined): [string, boolean][] {
  return Object.entries(m?.thresholds ?? {}).map(([expr, t]) => [expr, t.ok === true]);
}

// Turns the end-of-test data written by perf/journeys.js into evidence for RISK-PERF-01.
// A run with no requests, or without both required thresholds evaluated, never passes.
export function k6Evidence(summary: unknown): CheckEvidence {
  const requests = value(metric(summary, 'http_reqs'), 'count') ?? 0;
  const duration = metric(summary, 'http_req_duration');
  const failed = metric(summary, 'http_req_failed');
  const p95 = value(duration, 'p(95)');
  const failedRate = value(failed, 'rate') ?? value(failed, 'value');

  const checked = [...thresholdsOf(duration), ...thresholdsOf(failed)];
  const breached = checked.filter(([, ok]) => !ok).map(([expr]) => expr);
  const bothEvaluated = thresholdsOf(duration).length > 0 && thresholdsOf(failed).length > 0;

  const figures = `p95 ${p95 === undefined ? 'n/a' : `${p95.toFixed(1)} ms`}, failed ${failedRate === undefined ? 'n/a' : `${(failedRate * 100).toFixed(2)}%`}`;
  let detail: string;
  if (requests <= 0) detail = 'no requests were made';
  else if (!bothEvaluated) detail = `thresholds for http_req_duration and http_req_failed were not both evaluated (${figures})`;
  else if (breached.length > 0) detail = `${requests} requests, thresholds breached: ${breached.join(', ')} (${figures})`;
  else detail = `${requests} requests, thresholds held (${figures})`;

  return {
    name: K6_EVIDENCE_NAME,
    risks: ['RISK-PERF-01'],
    passed: requests > 0 && bothEvaluated && breached.length === 0,
    examined: requests,
    detail,
  };
}

function main(): void {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: DEFAULT_EVIDENCE_DIR } } });
  const file = positionals[0];
  if (!file) throw new Error('Usage: tsx src/gate/k6-evidence.ts <k6-summary.json> [--out <evidence dir>]');
  const evidence = k6Evidence(JSON.parse(readFileSync(file, 'utf8')));
  writeCheckEvidence(evidence, values.out);
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.passed ? 0 : 1;
}

if (isEntrypoint(process.argv[1], import.meta.url)) main();
