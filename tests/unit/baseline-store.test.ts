import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestInfo } from '@playwright/test';
import { expect, it } from 'vitest';
import { baselinesRoot, readBaselineCase, writeBaselineCase, type BaselineCase } from '../src/parity/baseline-store';
import { expectParity } from '../src/parity/expect-parity';
import type { ApprovedDifference } from '../src/parity/approved-differences';

const tmp = () => mkdtempSync(join(tmpdir(), 'bl-'));
const sample = (over: Partial<BaselineCase> = {}): BaselineCase => ({
  suite: 'fee', caseId: 'fee-reno-10.70-senior', risks: ['RISK-FEE-01'],
  request: { a: 1 }, normalized: { status: 200, data: { fee: 174.67 }, errors: [] },
  recordedAt: '2026-10-15T00:00:00.000Z', ...over,
});
const fakeInfo = () => ({ annotations: [] as { type: string; description?: string }[] }) as unknown as TestInfo;

it('writes one file per case at <root>/<suite>/<caseId>.json and reads it back', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const file = join(root, 'fee', 'fee-reno-10.70-senior.json');
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(sample(), null, 2)}\n`);
  expect(readBaselineCase('fee', 'fee-reno-10.70-senior', root)).toEqual(sample());
});

it('returns undefined for a missing case or suite', () => {
  const root = tmp();
  expect(readBaselineCase('fee', 'nope', root)).toBeUndefined();
  writeBaselineCase(sample(), root);
  expect(readBaselineCase('fee', 'nope', root)).toBeUndefined();
  expect(readBaselineCase('other', 'fee-reno-10.70-senior', root)).toBeUndefined();
});

it('overwrites an existing case', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  writeBaselineCase(sample({ request: { a: 2 } }), root);
  expect(readBaselineCase('fee', 'fee-reno-10.70-senior', root)?.request).toEqual({ a: 2 });
});

it('rejects names that are not kebab case or could escape the root', () => {
  const root = tmp();
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', '.hidden', 'a b', '-x', 'Fee', 'a_b', 'fee.RENO']) {
    expect(() => writeBaselineCase(sample({ caseId: bad }), root)).toThrow(/caseId/);
    expect(() => writeBaselineCase(sample({ suite: bad }), root)).toThrow(/suite/);
    expect(() => readBaselineCase(bad, 'x', root)).toThrow(/suite/);
    expect(() => readBaselineCase('x', bad, root)).toThrow(/caseId/);
  }
});

it('throws on a corrupt or malformed baseline instead of treating it as missing', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee'));
  writeFileSync(join(root, 'fee', 'bad.json'), 'not json');
  expect(() => readBaselineCase('fee', 'bad', root)).toThrow(/fee\/bad/);
  writeFileSync(join(root, 'fee', 'short.json'), JSON.stringify({ suite: 'fee' }));
  expect(() => readBaselineCase('fee', 'short', root)).toThrow(/fee\/short/);
});

it('rejects a baseline whose recorded suite or caseId disagrees with its path', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee'));
  writeFileSync(join(root, 'fee', 'x.json'), JSON.stringify(sample({ caseId: 'y' })));
  expect(() => readBaselineCase('fee', 'x', root)).toThrow(/fee\/x/);
});

it('rejects a non-ISO recordedAt', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee'));
  writeFileSync(join(root, 'fee', 'x.json'), JSON.stringify(sample({ caseId: 'x', recordedAt: 'yesterday' })));
  expect(() => readBaselineCase('fee', 'x', root)).toThrow(/fee\/x/);
});

it('uses BASELINES_DIR when set and the tests/baselines/legacy folder otherwise', () => {
  expect(baselinesRoot({ BASELINES_DIR: '/x/y' })).toBe('/x/y');
  const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  expect(baselinesRoot({})).toBe(join(testsDir, 'baselines', 'legacy'));
  expect(baselinesRoot({ BASELINES_DIR: '' })).toMatch(/\/baselines\/legacy$/);
});


interface RunOptions { mode: 'compare' | 'record'; root: string; approved: ApprovedDifference[] }

// expectParity takes no options, so tests drive it the way a real run does: through the environment.
function parity(info: TestInfo, args: Parameters<typeof expectParity>[1], o: RunOptions): void {
  const file = join(tmp(), 'ad.json');
  writeFileSync(file, JSON.stringify(o.approved));
  const saved = { ...process.env };
  try {
    Object.assign(process.env, {
      TARGET: 'legacy', BASE_URL: 'http://localhost:8081', PARITY_MODE: o.mode,
      BASELINES_DIR: o.root, APPROVED_DIFFERENCES_FILE: file,
    });
    expectParity(info, args);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const base = { suite: 'fee', caseId: 'fee-reno-10.70-senior', risks: ['RISK-FEE-01'], request: { a: 1 } as const };
const actualOk = { status: 200, data: { fee: 174.67 }, errors: [] };

it('compare mode with no baseline file throws and names the case', () => {
  const root = tmp();
  expect(() => parity(fakeInfo(), { ...base, actual: actualOk }, { mode: 'compare', root, approved: [] }))
    .toThrow('No legacy baseline for fee/fee-reno-10.70-senior');
});

it('compare mode passes on equal output and annotates parity=1', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const info = fakeInfo();
  parity(info, { ...base, actual: actualOk }, { mode: 'compare', root, approved: [] });
  expect(info.annotations).toEqual([{ type: 'evidence', description: 'parity=1' }]);
});

it('compare mode fails listing each remaining difference', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const actual = { status: 200, data: { fee: '174.67' }, errors: [] };
  expect(() => parity(fakeInfo(), { ...base, actual }, { mode: 'compare', root, approved: [] }))
    .toThrow(/fee\/fee-reno-10\.70-senior[\s\S]*\$\.data\.fee[\s\S]*type[\s\S]*174\.67/);
});

it('compare mode fails when the request differs from the recorded request', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  expect(() => parity(fakeInfo(), { ...base, request: { a: 2 }, actual: actualOk }, { mode: 'compare', root, approved: [] }))
    .toThrow(/request/i);
});

it('compare mode applies approved differences and annotates them', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const approved: ApprovedDifference[] = [{ id: 'AD-007', suite: 'fee', caseId: '*', path: '$.data.fee', reason: 'r', approvedBy: 'o', approvedOn: '2026-11-02' }];
  const info = fakeInfo();
  parity(info, { ...base, actual: { status: 200, data: { fee: 1 }, errors: [] } }, { mode: 'compare', root, approved });
  expect(info.annotations).toEqual([
    { type: 'evidence', description: 'parity=1' },
    { type: 'approved-difference', description: 'AD-007' },
  ]);
});

it('compare mode still fails on differences that are not approved', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const approved: ApprovedDifference[] = [{ id: 'AD-007', suite: 'fee', caseId: '*', path: '$.data.fee', reason: 'r', approvedBy: 'o', approvedOn: '2026-11-02' }];
  const info = fakeInfo();
  expect(() => parity(info, { ...base, actual: { status: 500, data: { fee: 1 }, errors: [] } }, { mode: 'compare', root, approved }))
    .toThrow(/\$\.status/);
  expect(info.annotations.map((a) => a.description)).toContain('AD-007');
});

it('record mode writes the case with risks, request, normalized and an ISO recordedAt', () => {
  const root = tmp();
  const info = fakeInfo();
  const before = Date.now();
  parity(info, { ...base, actual: actualOk }, { mode: 'record', root, approved: [] });
  const stored = readBaselineCase('fee', 'fee-reno-10.70-senior', root)!;
  expect(stored).toMatchObject({ suite: 'fee', caseId: 'fee-reno-10.70-senior', risks: ['RISK-FEE-01'], request: { a: 1 }, normalized: actualOk });
  expect(new Date(stored.recordedAt).toISOString()).toBe(stored.recordedAt);
  expect(Date.parse(stored.recordedAt)).toBeGreaterThanOrEqual(before - 1000);
  expect(info.annotations).toEqual([{ type: 'baseline-recorded', description: 'fee/fee-reno-10.70-senior' }]);
});

it('record mode does not read or require an existing baseline and never throws on differences', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  parity(fakeInfo(), { ...base, actual: { status: 500, data: null, errors: [] } }, { mode: 'record', root, approved: [] });
  expect(readBaselineCase('fee', 'fee-reno-10.70-senior', root)?.normalized).toEqual({ status: 500, data: null, errors: [] });
});

it('only treats a missing file as no baseline, other read errors surface', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee', 'dir.json'), { recursive: true });
  expect(() => readBaselineCase('fee', 'dir', root)).toThrow(/EISDIR/);
});

it('rejects a baseline recorded for another suite', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee'));
  writeFileSync(join(root, 'fee', 'x.json'), JSON.stringify(sample({ suite: 'other', caseId: 'x' })));
  expect(() => readBaselineCase('fee', 'x', root)).toThrow(/records other\/x/);
});

it('keeps the parse error as the cause of an unreadable baseline', () => {
  const root = tmp();
  mkdirSync(join(root, 'fee'));
  writeFileSync(join(root, 'fee', 'bad.json'), 'not json');
  try {
    readBaselineCase('fee', 'bad', root);
    expect.unreachable();
  } catch (e) {
    expect((e as Error).message).toMatch(/^Baseline fee\/bad is unreadable: /);
    expect((e as Error).cause).toBeInstanceOf(Error);
  }
});

it('describes a type difference with both values on one line', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const actual = { status: 200, data: { fee: '174.67' }, errors: [] };
  expect(() => parity(fakeInfo(), { ...base, actual }, { mode: 'compare', root, approved: [] })).toThrow(
    'Parity failed for fee/fee-reno-10.70-senior, 1 difference(s):\n$.data.fee (type) expected 174.67 actual "174.67"',
  );
});

it('describes missing and added keys with only the value that exists', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const actual = { status: 200, data: { extra: 1 }, errors: [] };
  expect(() => parity(fakeInfo(), { ...base, actual }, { mode: 'compare', root, approved: [] })).toThrow(
    'Parity failed for fee/fee-reno-10.70-senior, 2 difference(s):\n$.data.fee (missing) expected 174.67\n$.data.extra (added) actual 1',
  );
});

it('describes a request mismatch with the request path', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  expect(() => parity(fakeInfo(), { ...base, request: { a: 2 }, actual: actualOk }, { mode: 'compare', root, approved: [] })).toThrow(
    'Request for fee/fee-reno-10.70-senior differs from the recorded request, re-record the baseline:\n$request.a (changed) expected 1 actual 2',
  );
});

it('lists every request difference on its own line', () => {
  const root = tmp();
  writeBaselineCase(sample({ request: { a: 1, b: 1 } }), root);
  expect(() => parity(fakeInfo(), { ...base, request: { a: 2, b: 2 }, actual: actualOk }, { mode: 'compare', root, approved: [] })).toThrow(
    '$request.a (changed) expected 1 actual 2\n$request.b (changed) expected 1 actual 2',
  );
});

it('record mode never claims parity evidence, and compare mode always does', () => {
  const root = tmp();
  const rec = fakeInfo();
  parity(rec, { ...base, actual: actualOk }, { mode: 'record', root, approved: [] });
  expect(rec.annotations.map((a) => a.type)).toEqual(['baseline-recorded']);
  const cmp = fakeInfo();
  parity(cmp, { ...base, actual: actualOk }, { mode: 'compare', root, approved: [] });
  expect(cmp.annotations.map((a) => a.type)).toEqual(['evidence']);
});

it('refuses to record from a non-legacy target even though the mode asks for it', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { TARGET: 'modern', BASE_URL: 'http://localhost:8082', PARITY_MODE: 'record', BASELINES_DIR: tmp() });
    expect(() => expectParity(fakeInfo(), { ...base, actual: actualOk })).toThrow(/only be recorded from the legacy app/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

it('uses the committed approved differences file when APPROVED_DIFFERENCES_FILE is not set', () => {
  const root = tmp();
  writeBaselineCase(sample(), root);
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { TARGET: 'legacy', BASE_URL: 'http://localhost:8081', PARITY_MODE: 'compare', BASELINES_DIR: root });
    delete process.env.APPROVED_DIFFERENCES_FILE;
    expectParity(fakeInfo(), { ...base, actual: actualOk });
    expect(() => expectParity(fakeInfo(), { ...base, actual: { status: 500, data: null, errors: [] } })).toThrow(/\$\.status/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
