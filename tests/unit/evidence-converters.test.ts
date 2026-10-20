import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { exitWith, isEntrypoint } from '../src/gate/entrypoint';
import { DEFAULT_EVIDENCE_DIR, readCheckEvidence, writeCheckEvidence } from '../src/gate/evidence';
import { k6Evidence, runK6Cli } from '../src/gate/k6-evidence';
import {
  BUDGETS, lighthouseEvidence, runLighthouseCli, summarizeDirectory, summarizeReports,
} from '../src/gate/lighthouse-evidence';
import { MUTATION_THRESHOLD, mutationEvidence, runMutationCli } from '../src/gate/mutation-evidence';

const tmp = () => mkdtempSync(join(tmpdir(), 'conv-'));
afterEach(() => {
  vi.restoreAllMocks();
});

const metrics = (over: Record<string, unknown> = {}) => ({
  metrics: {
    http_reqs: { values: { count: 143 } },
    http_req_duration: { values: { 'p(95)': 17.14 }, thresholds: { 'p(95)<500': { ok: true } } },
    http_req_failed: { values: { rate: 0.0123 }, thresholds: { 'rate<0.01': { ok: true } } },
    ...over,
  },
});

// entrypoint

it('isEntrypoint matches only the exact module url of the started script', () => {
  const file = join(tmpdir(), 'x.ts');
  expect(isEntrypoint(file, pathToFileURL(file).href)).toBe(true);
  expect(isEntrypoint(file, pathToFileURL(join(tmpdir(), 'y.ts')).href)).toBe(false);
  expect(isEntrypoint(undefined, pathToFileURL(file).href)).toBe(false);
  expect(isEntrypoint('', pathToFileURL('').href)).toBe(false);
  expect(isEntrypoint('', '')).toBe(false);
});

it('exitWith prints the output and sets the exit code', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const saved = process.exitCode;
  try {
    exitWith({ output: 'hello', exitCode: 1 });
    expect(log).toHaveBeenCalledExactlyOnceWith('hello');
    expect(process.exitCode).toBe(1);
    exitWith({ output: 'again', exitCode: 0 });
    expect(process.exitCode).toBe(0);
  } finally {
    process.exitCode = saved;
  }
});

// evidence store

it('evidence directory default is reports/evidence', () => {
  expect(DEFAULT_EVIDENCE_DIR).toBe('reports/evidence');
});

it('writeCheckEvidence sanitises the file name, pretty prints with a trailing newline and creates the folder', () => {
  const dir = join(tmp(), 'a', 'b');
  const e = { name: 'my check/with:odd chars', risks: ['R'], passed: true, examined: 2, detail: 'd' };
  writeCheckEvidence(e, dir);
  const text = readFileSync(join(dir, 'my-check-with-odd-chars.json'), 'utf8');
  expect(text).toBe(`${JSON.stringify(e, null, 2)}\n`);
  expect(readCheckEvidence(dir)).toEqual([e]);
});

it('readCheckEvidence returns nothing for a missing folder, ignores non-json files and sorts by name', () => {
  const dir = tmp();
  expect(readCheckEvidence(join(dir, 'missing'))).toEqual([]);
  const ev = (name: string) => ({ name, risks: [], passed: true, examined: 1, detail: '' });
  writeFileSync(join(dir, '1.json'), JSON.stringify(ev('zeta')));
  writeFileSync(join(dir, '2.json'), JSON.stringify(ev('alpha')));
  writeFileSync(join(dir, 'notes.txt'), 'not json at all');
  writeFileSync(join(dir, 'json'), 'not json either');
  expect(readCheckEvidence(dir).map((e) => e.name)).toEqual(['alpha', 'zeta']);
});

it('readCheckEvidence names the file and the offending field of an invalid record', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ name: '', risks: [], passed: true, examined: 1, detail: '' }));
  expect(() => readCheckEvidence(dir)).toThrow('Invalid check evidence bad.json: name: ');
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ name: 'x', risks: [], passed: true, examined: 1, detail: '', extra: 1 }));
  expect(() => readCheckEvidence(dir)).toThrow(/Invalid check evidence bad\.json: .*extra/);
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ name: 'x', risks: [5], passed: 'yes', examined: 1, detail: '' }));
  expect(() => readCheckEvidence(dir)).toThrow(
    'Invalid check evidence bad.json: risks.0: Invalid input: expected string, received number; passed: Invalid input: expected boolean, received string',
  );
});

// k6

it('k6 evidence reports exact figures when thresholds held', () => {
  expect(k6Evidence(metrics())).toEqual({
    name: 'perf-k6-journeys',
    risks: ['RISK-PERF-01'],
    passed: true,
    examined: 143,
    detail: '143 requests, thresholds held (p95 17.1 ms, failed 1.23%)',
  });
});

it('k6 evidence says no requests were made and still passes nothing', () => {
  const e = k6Evidence(metrics({ http_reqs: { values: { count: 0 } } }));
  expect(e).toMatchObject({ passed: false, examined: 0, detail: 'no requests were made' });
  expect(k6Evidence(metrics({ http_reqs: { values: { count: -1 } } })).detail).toBe('no requests were made');
});

it('k6 evidence names every breached threshold in order, duration first', () => {
  const e = k6Evidence(metrics({
    http_req_duration: { values: { 'p(95)': 900 }, thresholds: { 'p(95)<500': { ok: false } } },
    http_req_failed: { values: { rate: 0.5 }, thresholds: { 'rate<0.01': { ok: false } } },
  }));
  expect(e.passed).toBe(false);
  expect(e.detail).toBe('143 requests, thresholds breached: p(95)<500, rate<0.01 (p95 900.0 ms, failed 50.00%)');
});

it('k6 evidence treats a threshold without ok true as breached', () => {
  const e = k6Evidence(metrics({ http_req_failed: { values: { rate: 0 }, thresholds: { 'rate<0.01': {} } } }));
  expect(e.passed).toBe(false);
  expect(e.detail).toContain('thresholds breached: rate<0.01');
});

it('k6 evidence needs thresholds on both duration and failure rate', () => {
  const onlyDuration = k6Evidence(metrics({ http_req_failed: { values: { rate: 0 } } }));
  const onlyFailed = k6Evidence(metrics({ http_req_duration: { values: { 'p(95)': 1 } } }));
  expect(onlyDuration.passed).toBe(false);
  expect(onlyFailed.passed).toBe(false);
  expect(onlyDuration.detail).toBe('thresholds for http_req_duration and http_req_failed were not both evaluated (p95 1.0 ms, failed 0.00%)'.replace('p95 1.0 ms', 'p95 17.1 ms'));
  expect(onlyFailed.detail).toContain('(p95 1.0 ms, failed 1.23%)');
});

it('k6 evidence shows n/a for missing figures', () => {
  const e = k6Evidence({ metrics: { http_reqs: { values: { count: 5 } } } });
  expect(e.detail).toBe('thresholds for http_req_duration and http_req_failed were not both evaluated (p95 n/a, failed n/a)');
});

it('k6 evidence prefers rate over value for the failure rate and reads flat values', () => {
  const both = k6Evidence(metrics({ http_req_failed: { values: { rate: 0.5, value: 0.25 }, thresholds: { t: { ok: true } } } }));
  expect(both.detail).toContain('failed 50.00%');
  const flat = k6Evidence(metrics({ http_req_failed: { rate: 0.25, thresholds: { t: { ok: true } } } }));
  expect(flat.detail).toContain('failed 25.00%');
  const flatValue = k6Evidence(metrics({ http_req_failed: { value: 0.125, thresholds: { t: { ok: true } } } }));
  expect(flatValue.detail).toContain('failed 12.50%');
});

it('k6 CLI writes the evidence file and exits 0 on a pass', () => {
  const dir = tmp();
  const summary = join(dir, 'k6.json');
  writeFileSync(summary, JSON.stringify(metrics()));
  const run = runK6Cli([summary, '--out', join(dir, 'ev')]);
  expect(run.exitCode).toBe(0);
  expect(JSON.parse(run.output)).toMatchObject({ name: 'perf-k6-journeys', passed: true });
  expect(run.output).toBe(JSON.stringify(k6Evidence(metrics()), null, 2));
  expect(readCheckEvidence(join(dir, 'ev'))).toHaveLength(1);
});

it('k6 CLI exits 1 on a breach and still writes the evidence', () => {
  const dir = tmp();
  const summary = join(dir, 'k6.json');
  writeFileSync(summary, JSON.stringify({}));
  const run = runK6Cli([summary, '--out', join(dir, 'ev')]);
  expect(run.exitCode).toBe(1);
  expect(readCheckEvidence(join(dir, 'ev')).map((e) => e.passed)).toEqual([false]);
});

it('k6 CLI requires the summary path', () => {
  expect(() => runK6Cli([])).toThrow('Usage: tsx src/gate/k6-evidence.ts <k6-summary.json> [--out <evidence dir>]');
});

// lighthouse

const cats = (p: number | null, a: number | null, b: number | null) => ({
  performance: { score: p }, accessibility: { score: a }, 'best-practices': { score: b },
});

it('lighthouse evidence prints the exact pass detail', () => {
  const e = lighthouseEvidence({ pages: [{ url: 'u', performance: 0.8, accessibility: 0.95, bestPractices: 0.9 }] });
  expect(e.detail).toBe('1 pages met performance 0.8, accessibility 0.95, best practices 0.9');
  expect(e.examined).toBe(1);
});

it('lighthouse evidence lists every miss as page, category, score and budget', () => {
  const e = lighthouseEvidence({
    pages: [
      { url: 'a', performance: 0.5, accessibility: 0.9, bestPractices: 1 },
      { url: 'b', performance: 1, accessibility: 1, bestPractices: 0.1 },
    ],
  });
  expect(e.detail).toBe('budgets missed: a performance 0.5 < 0.8; a accessibility 0.9 < 0.95; b bestPractices 0.1 < 0.9');
  expect(e.passed).toBe(false);
  expect(BUDGETS).toEqual({ performance: 0.8, accessibility: 0.95, bestPractices: 0.9 });
});

it('lighthouse evidence names the empty audit and handles a summary without pages', () => {
  expect(lighthouseEvidence({ pages: [] })).toMatchObject({ passed: false, examined: 0, detail: 'no pages were audited' });
  expect(lighthouseEvidence({} as never)).toMatchObject({ passed: false, examined: 0, detail: 'no pages were audited' });
});

it('summarizeReports medians: odd count, even count, numeric order and NaN poisoning', () => {
  const run = (p: number | null) => ({ requestedUrl: 'u', categories: cats(p, 1, 1) });
  expect(summarizeReports([run(2), run(10), run(3)]).pages[0]!.performance).toBe(3);
  expect(summarizeReports([run(0.6), run(0.8)]).pages[0]!.performance).toBeCloseTo(0.7, 10);
  expect(summarizeReports([run(1), run(2), run(3), run(10)]).pages[0]!.performance).toBe(2.5);
  expect(summarizeReports([run(0.9), run(null), run(0.9)]).pages[0]!.performance).toBeNaN();
});

it('summarizeReports falls back to finalUrl, prefers requestedUrl and keeps best practices apart', () => {
  const summary = summarizeReports([
    { finalUrl: 'http://f', categories: cats(0.1, 0.2, 0.3) },
    { requestedUrl: 'http://r', finalUrl: 'http://other', categories: cats(0.4, 0.5, 0.6) },
  ]);
  expect(summary.pages).toEqual([
    { url: 'http://f', performance: 0.1, accessibility: 0.2, bestPractices: 0.3 },
    { url: 'http://r', performance: 0.4, accessibility: 0.5, bestPractices: 0.6 },
  ]);
});

it('summarizeDirectory reads only files named lhr-*.json', () => {
  const dir = tmp();
  const body = (url: string) => JSON.stringify({ requestedUrl: url, categories: cats(1, 1, 1) });
  writeFileSync(join(dir, 'lhr-1.json'), body('http://keep/1'));
  writeFileSync(join(dir, 'lhr-.json'), body('http://keep/2'));
  writeFileSync(join(dir, 'xlhr-2.json'), body('http://skip/prefix'));
  writeFileSync(join(dir, 'lhr-3.json.bak'), body('http://skip/suffix'));
  writeFileSync(join(dir, 'other.json'), body('http://skip/other'));
  expect(summarizeDirectory(dir).pages.map((p) => p.url)).toEqual(['http://keep/1', 'http://keep/2']);
});

it('lighthouse CLI summarize writes the summary file and echoes it', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'lhr-1.json'), JSON.stringify({ requestedUrl: 'http://x/a', categories: cats(0.9, 1, 1) }));
  const out = join(dir, 'summary.json');
  const run = runLighthouseCli(['summarize', dir, out]);
  const expected = { pages: [{ url: 'http://x/a', performance: 0.9, accessibility: 1, bestPractices: 1 }] };
  expect(run).toEqual({ output: JSON.stringify(expected, null, 2), exitCode: 0 });
  expect(readFileSync(out, 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
});

it('lighthouse CLI summarize refuses a folder without usable reports and writes nothing', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'lhr-1.json'), JSON.stringify({ categories: cats(1, 1, 1) }));
  const out = join(dir, 'summary.json');
  expect(() => runLighthouseCli(['summarize', dir, out])).toThrow(`No Lighthouse reports with a requested URL found in ${dir}`);
  expect(() => readFileSync(out)).toThrow();
});

it('lighthouse CLI evidence converts a summary file and sets the exit code from the verdict', () => {
  const dir = tmp();
  const good = join(dir, 'good.json');
  const bad = join(dir, 'bad.json');
  writeFileSync(good, JSON.stringify({ pages: [{ url: 'u', performance: 1, accessibility: 1, bestPractices: 1 }] }));
  writeFileSync(bad, JSON.stringify({ pages: [{ url: 'u', performance: 0, accessibility: 1, bestPractices: 1 }] }));
  const ok = runLighthouseCli(['evidence', good, '--out', join(dir, 'ev')]);
  expect(ok.exitCode).toBe(0);
  expect(JSON.parse(ok.output)).toMatchObject({ name: 'perf-lighthouse-budgets', passed: true });
  expect(readCheckEvidence(join(dir, 'ev'))).toHaveLength(1);
  expect(runLighthouseCli(['evidence', bad, '--out', join(dir, 'ev2')]).exitCode).toBe(1);
});

it('lighthouse CLI shows usage for unknown or incomplete commands', () => {
  const usage = /Usage: tsx src\/gate\/lighthouse-evidence\.ts summarize <lhci dir> <summary\.json>\n {7}tsx src\/gate\/lighthouse-evidence\.ts evidence <summary\.json>/;
  expect(() => runLighthouseCli([])).toThrow(usage);
  expect(() => runLighthouseCli(['bogus', 'a', 'b'])).toThrow(usage);
  expect(() => runLighthouseCli(['summarize', 'a'])).toThrow(usage);
  expect(() => runLighthouseCli(['summarize', '', 'b'])).toThrow(usage);
  expect(() => runLighthouseCli(['summarize'])).toThrow(usage);
  expect(() => runLighthouseCli(['evidence'])).toThrow(usage);
  expect(() => runLighthouseCli(['evidence', ''])).toThrow(usage);
});

// mutation

const stryker = (statuses: Record<string, number>) => ({
  files: { 'a.ts': { mutants: Object.entries(statuses).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status }))) } },
});

it('mutation evidence prints the exact breakdown and sums over files', () => {
  const report = {
    files: {
      'a.ts': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
      'b.ts': { mutants: [{ status: 'Timeout' }, { status: 'NoCoverage' }, { status: 'Killed' }, { status: 'Killed' }, { status: 'Killed' }, { status: 'Killed' }] },
    },
  };
  expect(mutationEvidence(report)).toEqual({
    name: 'mutation-score',
    risks: ['RISK-TEST-01'],
    passed: false,
    examined: 8,
    detail: 'mutation score 75.00% (threshold 85): killed 5, timeout 1, survived 1, no coverage 1',
  });
  expect(MUTATION_THRESHOLD).toBe(85);
});

it('mutation evidence passes at exactly the threshold and fails a hair below', () => {
  expect(mutationEvidence(stryker({ Killed: 85, Survived: 15 })).passed).toBe(true);
  expect(mutationEvidence(stryker({ Killed: 849, Survived: 151 })).passed).toBe(false);
});

it('mutation evidence skips undefined files and mutants without a status', () => {
  const e = mutationEvidence({ files: { gone: undefined, nostatus: { mutants: [{}, { status: 'Killed' }] }, empty: {} } });
  expect(e.examined).toBe(1);
  expect(e.detail).toContain('mutation score 100.00%');
});

it('mutation evidence rejects a files value that is missing, null or not an object', () => {
  expect(() => mutationEvidence({ files: null as never })).toThrow('Not a Stryker mutation report');
  expect(() => mutationEvidence({ files: 'x' as never })).toThrow('Not a Stryker mutation report');
});

it('mutation CLI writes evidence and exits by verdict', () => {
  const dir = tmp();
  const good = join(dir, 'good.json');
  const bad = join(dir, 'bad.json');
  writeFileSync(good, JSON.stringify(stryker({ Killed: 9, Survived: 1 })));
  writeFileSync(bad, JSON.stringify(stryker({ Killed: 1, Survived: 9 })));
  const ok = runMutationCli([good, '--out', join(dir, 'ev')]);
  expect(ok.exitCode).toBe(0);
  expect(ok.output).toBe(JSON.stringify(mutationEvidence(stryker({ Killed: 9, Survived: 1 })), null, 2));
  expect(readCheckEvidence(join(dir, 'ev')).map((e) => e.name)).toEqual(['mutation-score']);
  expect(runMutationCli([bad, '--out', join(dir, 'ev2')]).exitCode).toBe(1);
});

it('mutation CLI requires an input path', () => {
  expect(() => runMutationCli([])).toThrow('Usage: tsx src/gate/mutation-evidence.ts <mutation.json> [--out <evidence dir>]');
});
