import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_EVIDENCE_DIR, writeCheckEvidence, type CheckEvidence } from './evidence';
import { isEntrypoint } from './entrypoint';

export const LIGHTHOUSE_EVIDENCE_NAME = 'perf-lighthouse-budgets';

// Budgets for the modern app (RISK-PERF-02). The legacy run only records scores.
export const BUDGETS = { performance: 0.8, accessibility: 0.95, bestPractices: 0.9 } as const;

export interface PageScores {
  url: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
}

export interface LighthouseSummary {
  pages: PageScores[];
}

interface Lhr {
  requestedUrl?: string;
  finalUrl?: string;
  categories?: Record<string, { score: number | null } | undefined>;
}

function median(values: number[]): number {
  if (values.some((v) => Number.isNaN(v))) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Collapses Lighthouse CI report objects (lhr-*.json) into one row per page, using the median of repeated runs.
export function summarizeReports(reports: Lhr[]): LighthouseSummary {
  const byUrl = new Map<string, PageScores[]>();
  for (const r of reports) {
    // A missing or null score becomes NaN so the page stays in the summary and counts as a miss.
    const score = (v: number | null | undefined): number => (typeof v === 'number' ? v : Number.NaN);
    const performance = score(r.categories?.performance?.score);
    const accessibility = score(r.categories?.accessibility?.score);
    const bestPractices = score(r.categories?.['best-practices']?.score);
    const url = r.requestedUrl ?? r.finalUrl;
    if (!url) continue;
    byUrl.set(url, [...(byUrl.get(url) ?? []), { url, performance, accessibility, bestPractices }]);
  }
  const pages = [...byUrl.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, runs]) => ({
      url,
      performance: median(runs.map((p) => p.performance)),
      accessibility: median(runs.map((p) => p.accessibility)),
      bestPractices: median(runs.map((p) => p.bestPractices)),
    }));
  return { pages };
}

export function summarizeDirectory(dir: string): LighthouseSummary {
  const files = readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f));
  return summarizeReports(files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Lhr));
}

// Evidence for RISK-PERF-02. Auditing no pages never passes.
export function lighthouseEvidence(summary: LighthouseSummary): CheckEvidence {
  const pages = summary.pages ?? [];
  const misses = pages.flatMap((p) =>
    (Object.keys(BUDGETS) as (keyof typeof BUDGETS)[])
      .filter((k) => !(p[k] >= BUDGETS[k]))
      .map((k) => `${p.url} ${k} ${p[k]} < ${BUDGETS[k]}`),
  );
  let detail: string;
  if (pages.length === 0) detail = 'no pages were audited';
  else if (misses.length > 0) detail = `budgets missed: ${misses.join('; ')}`;
  else detail = `${pages.length} pages met performance ${BUDGETS.performance}, accessibility ${BUDGETS.accessibility}, best practices ${BUDGETS.bestPractices}`;
  return {
    name: LIGHTHOUSE_EVIDENCE_NAME,
    risks: ['RISK-PERF-02'],
    passed: pages.length > 0 && misses.length === 0,
    examined: pages.length,
    detail,
  };
}

const USAGE = 'Usage: tsx src/gate/lighthouse-evidence.ts summarize <lhci dir> <summary.json>\n       tsx src/gate/lighthouse-evidence.ts evidence <summary.json> [--out <evidence dir>]';

function main(): void {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: DEFAULT_EVIDENCE_DIR } } });
  const [command, input, output] = positionals;
  if (command === 'summarize' && input && output) {
    const summary = summarizeDirectory(input);
    if (summary.pages.length === 0) throw new Error(`No Lighthouse reports with a requested URL found in ${input}`);
    writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (command === 'evidence' && input) {
    const evidence = lighthouseEvidence(JSON.parse(readFileSync(input, 'utf8')) as LighthouseSummary);
    writeCheckEvidence(evidence, values.out);
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = evidence.passed ? 0 : 1;
    return;
  }
  throw new Error(USAGE);
}

if (isEntrypoint(process.argv[1], import.meta.url)) main();
