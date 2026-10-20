import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_EVIDENCE_DIR, readCheckEvidence, writeCheckEvidence, type CheckEvidence } from '../src/gate/evidence';
import { parsePlaywrightReport, readPlaywrightResults } from '../src/gate/results';

const tmp = () => mkdtempSync(join(tmpdir(), 'gate-'));
const fixture = (name: string) => JSON.parse(readFileSync(`unit/fixtures/${name}`, 'utf8')) as unknown;

const report = (tests: object[], tags: string[] = [], title = 't') => ({
  suites: [{ title: 'f.spec.ts', file: 'f.spec.ts', specs: [{ title, file: 'f.spec.ts', tags, tests }] }],
});
const one = (status: string, expectedStatus: string, annotations: object[] = []) =>
  ({ status, expectedStatus, annotations, results: [] });

it('reads a real smoke report: file, title, passed status and @ tags', () => {
  const results = parsePlaywrightReport(fixture('playwright-smoke.json'));
  expect(results).toHaveLength(3);
  expect(results[0]).toEqual({
    title: 'permitTypes', file: 'smoke/legacy-api.spec.ts', status: 'passed', tags: ['@smoke'], evidence: [], baselineRecorded: false,
  });
  expect(results.map((r) => r.title)).toEqual(['permitTypes', 'feeQuote', 'each page loads with HTTP 200']);
});

it('reads a real report with annotations: risk tag normalized, evidence parsed, skipped status', () => {
  const [parity, skipped] = parsePlaywrightReport(fixture('playwright-annotations.json'));
  expect(parity!.tags).toEqual(['@RISK-FEE-01', '@parity']);
  expect(parity!.evidence).toEqual([{ name: 'parity', examined: 1 }]);
  expect(parity!.status).toBe('passed');
  expect(skipped!.status).toBe('skipped');
  expect(skipped!.evidence).toEqual([]);
});

it('keeps tags that already carry the @ and does not double it', () => {
  const [r] = parsePlaywrightReport(report([one('expected', 'passed')], ['@api', 'RISK-A-01']));
  expect(r!.tags).toEqual(['@api', '@RISK-A-01']);
});

it('sums evidence annotations with the same name and keeps different names apart', () => {
  const ann = [
    { type: 'evidence', description: 'parity=2' },
    { type: 'evidence', description: 'parity=3' },
    { type: 'evidence', description: 'rows=7' },
    { type: 'approved-difference', description: 'AD-1' },
    { type: 'other', description: 'parity=100' },
  ];
  const [r] = parsePlaywrightReport(report([one('expected', 'passed', ann)]));
  expect(r!.evidence).toEqual([{ name: 'parity', examined: 5 }, { name: 'rows', examined: 7 }]);
});

it('treats malformed or missing evidence counts as zero examined', () => {
  const ann = [
    { type: 'evidence', description: 'noequals' },
    { type: 'evidence', description: 'bad=abc' },
    { type: 'evidence' },
    { type: 'evidence', description: 'neg=-2' },
  ];
  const [r] = parsePlaywrightReport(report([one('expected', 'passed', ann)]));
  expect(r!.evidence).toEqual([
    { name: 'noequals', examined: 0 },
    { name: 'bad', examined: 0 },
    { name: '', examined: 0 },
    { name: 'neg', examined: 0 },
  ]);
});

it('maps Playwright statuses: expected pass, unexpected, flaky, skipped, expected failure', () => {
  const statuses = parsePlaywrightReport(report([
    one('expected', 'passed'), one('unexpected', 'passed'), one('flaky', 'passed'),
    one('skipped', 'skipped'), one('expected', 'failed'),
  ])).map((r) => r.status);
  expect(statuses).toEqual(['passed', 'failed', 'failed', 'skipped', 'failed']);
});

it('walks nested suites and several tests per spec (one result per project)', () => {
  const nested = {
    suites: [{
      title: 'a', file: 'a.spec.ts', specs: [],
      suites: [{ title: 'b', file: 'a.spec.ts', specs: [{ title: 'x', file: 'a.spec.ts', tags: [], tests: [one('expected', 'passed'), one('expected', 'passed')] }], suites: [] }],
    }],
  };
  expect(parsePlaywrightReport(nested)).toHaveLength(2);
});

it('rejects a report that is not a Playwright JSON report', () => {
  expect(() => parsePlaywrightReport({ nope: true })).toThrow(/Playwright JSON report/);
  expect(() => parsePlaywrightReport(null)).toThrow(/Playwright JSON report/);
});

it('readPlaywrightResults reads a file and names the file when it cannot be read', () => {
  expect(readPlaywrightResults('unit/fixtures/playwright-smoke.json')).toHaveLength(3);
  expect(() => readPlaywrightResults('unit/fixtures/missing.json')).toThrow(/missing\.json/);
});

const check = (over: Partial<CheckEvidence> = {}): CheckEvidence => ({
  name: 'seed row counts', risks: ['RISK-DATA-01'], passed: true, examined: 120, detail: 'ok', ...over,
});

it('writeCheckEvidence writes one JSON file per check and readCheckEvidence reads them sorted by name', () => {
  const dir = join(tmp(), 'evidence');
  writeCheckEvidence(check({ name: 'b check' }), dir);
  writeCheckEvidence(check({ name: 'a/check: one' }), dir);
  const read = readCheckEvidence(dir);
  expect(read.map((c) => c.name)).toEqual(['a/check: one', 'b check']);
  expect(read[1]).toEqual(check({ name: 'b check' }));
});

it('writeCheckEvidence overwrites a check with the same name', () => {
  const dir = tmp();
  writeCheckEvidence(check({ examined: 1 }), dir);
  writeCheckEvidence(check({ examined: 9 }), dir);
  expect(readCheckEvidence(dir)).toEqual([check({ examined: 9 })]);
});

it('readCheckEvidence returns an empty list when the directory does not exist', () => {
  expect(readCheckEvidence(join(tmp(), 'nothing'))).toEqual([]);
});

it('readCheckEvidence ignores non-JSON files and rejects an invalid evidence file', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  expect(readCheckEvidence(dir)).toEqual([]);
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ name: 'x' }));
  expect(() => readCheckEvidence(dir)).toThrow(/bad\.json/);
});

it('the default evidence directory is reports/evidence, which the gate CLI also reads by default', () => {
  expect(DEFAULT_EVIDENCE_DIR).toBe('reports/evidence');
});

it('names the evidence file after the sanitized check name, as pretty JSON with a trailing newline', () => {
  const dir = tmp();
  writeCheckEvidence(check({ name: 'a/b: c  d' }), dir);
  expect(readdirSync(dir)).toEqual(['a-b-c-d.json']);
  expect(readFileSync(join(dir, 'a-b-c-d.json'), 'utf8')).toBe(`${JSON.stringify(check({ name: 'a/b: c  d' }), null, 2)}\n`);
});

it('reads evidence sorted by name even when file names sort differently', () => {
  const dir = tmp();
  writeCheckEvidence(check({ name: 'b' }), dir);
  writeCheckEvidence(check({ name: 'a' }), dir);
  writeFileSync(join(dir, 'z.json'), JSON.stringify(check({ name: 'A first' })));
  expect(readCheckEvidence(dir).map((c) => c.name)).toEqual(['a', 'A first', 'b']);
});

it('keeps an evidence annotation with an empty name but a count', () => {
  const [r] = parsePlaywrightReport(report([one('expected', 'passed', [{ type: 'evidence', description: '=5' }])]));
  expect(r!.evidence).toEqual([{ name: '', examined: 5 }]);
});

it('flags tests that carry a baseline-recorded annotation', () => {
  const results = parsePlaywrightReport(fixture('playwright-record-mode.json'));
  expect(results.map((r) => r.baselineRecorded)).toEqual([true]);
  expect(parsePlaywrightReport(fixture('playwright-smoke.json')).every((r) => !r.baselineRecorded)).toBe(true);
});
