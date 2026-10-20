import { readFileSync } from 'node:fs';

export interface TestResult {
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  tags: string[];
  evidence: { name: string; examined: number }[];
  // True when the test recorded a baseline (record mode), so its pass proves nothing.
  baselineRecorded: boolean;
}

interface JsonTest {
  status?: string;
  expectedStatus?: string;
  annotations?: { type: string; description?: string }[];
}
interface JsonSpec { title: string; file: string; tags?: string[]; tests?: JsonTest[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }

function toStatus(t: JsonTest): TestResult['status'] {
  if (t.status === 'skipped') return 'skipped';
  return t.status === 'expected' && t.expectedStatus === 'passed' ? 'passed' : 'failed';
}

// Annotations are pushed as `evidence` with a `name=count` description (see expect-parity.ts).
function toEvidence(annotations: JsonTest['annotations']): TestResult['evidence'] {
  const sums = new Map<string, number>();
  for (const a of annotations ?? []) {
    if (a.type !== 'evidence') continue;
    const text = a.description ?? '';
    const at = text.lastIndexOf('=');
    const name = at < 0 ? text : text.slice(0, at);
    const count = at < 0 ? 0 : Number(text.slice(at + 1));
    sums.set(name, (sums.get(name) ?? 0) + (Number.isFinite(count) && count > 0 ? count : 0));
  }
  return [...sums].map(([name, examined]) => ({ name, examined }));
}

function collect(suite: JsonSuite, out: TestResult[]): void {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      out.push({
        title: spec.title,
        file: spec.file,
        status: toStatus(t),
        tags: (spec.tags ?? []).map((tag) => (tag.startsWith('@') ? tag : `@${tag}`)),
        evidence: toEvidence(t.annotations),
        baselineRecorded: (t.annotations ?? []).some((a) => a.type === 'baseline-recorded'),
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, out);
}

export function parsePlaywrightReport(json: unknown): TestResult[] {
  const root = json as { suites?: unknown } | null;
  if (!root || !Array.isArray(root.suites)) {
    throw new Error('Not a Playwright JSON report: no top-level suites array');
  }
  const out: TestResult[] = [];
  for (const suite of root.suites as JsonSuite[]) collect(suite, out);
  return out;
}

export function readPlaywrightResults(jsonFile: string): TestResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonFile, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read Playwright report ${jsonFile}: ${(e as Error).message}`, { cause: e });
  }
  return parsePlaywrightReport(raw);
}
