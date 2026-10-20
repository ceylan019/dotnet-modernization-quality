import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { compareBaselineDirs, isDeterministic, runCompareCli } from '../src/parity/compare-baseline-dirs';

function put(root: string, file: string, body: string): void {
  const path = join(root, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}
const json = (v: unknown) => JSON.stringify(v);
function pair(): [string, string] {
  return [mkdtempSync(join(tmpdir(), 'cmpx-a-')), mkdtempSync(join(tmpdir(), 'cmpx-b-'))];
}

it('walks nested folders, ignores non-json files and skips perf only at the top level', () => {
  const [a, b] = pair();
  put(a, 'deep/er/x.json', json({ v: 1 }));
  put(b, 'deep/er/x.json', json({ v: 1 }));
  put(a, 'notes.txt', 'a');
  put(b, 'notes.txt', 'b');
  put(a, 'json', 'a');
  put(b, 'json', 'b');
  put(a, 'api/perf/y.json', json({ v: 1 }));
  put(b, 'api/perf/y.json', json({ v: 2 }));
  const result = compareBaselineDirs(a, b);
  expect(result.files).toBe(2);
  expect(result.different).toEqual(['api/perf/y.json']);
});

it('removes recordedAt only from the top level of an object', () => {
  const [a, b] = pair();
  put(a, 'o.json', json({ recordedAt: 1, inner: { recordedAt: 1 } }));
  put(b, 'o.json', json({ recordedAt: 2, inner: { recordedAt: 2 } }));
  put(a, 'arr.json', json([{ recordedAt: 1 }]));
  put(b, 'arr.json', json([{ recordedAt: 2 }]));
  const result = compareBaselineDirs(a, b);
  expect(result.different).toEqual(['arr.json', 'o.json']);
  expect(result.firstDifferences['o.json']).toEqual({ path: '$.inner.recordedAt', first: 1, second: 2 });
  expect(result.firstDifferences['arr.json']).toEqual({ path: '$[0].recordedAt', first: 1, second: 2 });
});

it('compares top level null and scalars without throwing', () => {
  const [a, b] = pair();
  put(a, 'n.json', 'null');
  put(b, 'n.json', 'null');
  put(a, 's.json', '5');
  put(b, 's.json', '6');
  const result = compareBaselineDirs(a, b);
  expect(result.different).toEqual(['s.json']);
  expect(result.firstDifferences['s.json']).toEqual({ path: '$', first: 5, second: 6 });
});

it('locates differences in arrays of different length and in keys present on one side', () => {
  const [a, b] = pair();
  put(a, 'len.json', json({ items: [1, 2] }));
  put(b, 'len.json', json({ items: [1, 2, 3] }));
  put(a, 'key.json', json({ same: 1, onlyA: 'x' }));
  put(b, 'key.json', json({ same: 1 }));
  put(a, 'kind.json', json({ v: [1] }));
  put(b, 'kind.json', json({ v: { 0: 1 } }));
  put(a, 'nul.json', json({ v: null }));
  put(b, 'nul.json', json({ v: {} }));
  const d = compareBaselineDirs(a, b).firstDifferences;
  expect(d['len.json']).toEqual({ path: '$.items[2]', first: undefined, second: 3 });
  expect(d['key.json']).toEqual({ path: '$.onlyA', first: 'x', second: undefined });
  expect(d['kind.json']).toEqual({ path: '$.v', first: [1], second: { 0: 1 } });
  expect(d['nul.json']).toEqual({ path: '$.v', first: null, second: {} });
});

it('reports the alphabetically first differing key and sorts every listing', () => {
  const [a, b] = pair();
  put(a, 'z.json', json({ b: 1, a: 1 }));
  put(b, 'z.json', json({ b: 2, a: 2 }));
  put(a, 'm.json', json({ v: 1 }));
  put(b, 'm.json', json({ v: 2 }));
  put(a, 'only/b2.json', '{}');
  put(a, 'only/b1.json', '{}');
  put(b, 'only/c2.json', '{}');
  put(b, 'only/c1.json', '{}');
  const result = compareBaselineDirs(a, b);
  expect(result.different).toEqual(['m.json', 'z.json']);
  expect(result.firstDifferences['z.json']!.path).toBe('$.a');
  expect(result.onlyInFirst).toEqual(['only/b1.json', 'only/b2.json']);
  expect(result.onlyInSecond).toEqual(['only/c1.json', 'only/c2.json']);
  expect(result.files).toBe(2);
});

it('isDeterministic is false when any one condition fails', () => {
  const base = { files: 1, onlyInFirst: [], onlyInSecond: [], different: [], firstDifferences: {} };
  expect(isDeterministic(base)).toBe(true);
  expect(isDeterministic({ ...base, files: 0 })).toBe(false);
  expect(isDeterministic({ ...base, onlyInFirst: ['a'] })).toBe(false);
  expect(isDeterministic({ ...base, onlyInSecond: ['a'] })).toBe(false);
  expect(isDeterministic({ ...base, different: ['a'] })).toBe(false);
});

it('compare CLI exits 0 for agreeing folders and prints the comparison', () => {
  const [a, b] = pair();
  put(a, 'x.json', json({ recordedAt: 1, v: 1 }));
  put(b, 'x.json', json({ recordedAt: 2, v: 1 }));
  const run = runCompareCli([a, b]);
  expect(run.exitCode).toBe(0);
  expect(JSON.parse(run.output)).toEqual({ files: 1, onlyInFirst: [], onlyInSecond: [], different: [], firstDifferences: {} });
});

it('compare CLI exits 1 for differing or empty folders', () => {
  const [a, b] = pair();
  expect(runCompareCli([a, b]).exitCode).toBe(1);
  put(a, 'x.json', json({ v: 1 }));
  put(b, 'x.json', json({ v: 2 }));
  const run = runCompareCli([a, b]);
  expect(run.exitCode).toBe(1);
  expect(JSON.parse(run.output).firstDifferences['x.json']).toEqual({ path: '$.v', first: 1, second: 2 });
});

it('compare CLI needs both folders', () => {
  const usage = 'Usage: tsx src/parity/compare-baseline-dirs.ts <first dir> <second dir>';
  expect(() => runCompareCli([])).toThrow(usage);
  expect(() => runCompareCli(['only-one'])).toThrow(usage);
  expect(() => runCompareCli(['', 'b'])).toThrow(usage);
  expect(() => runCompareCli(['a', ''])).toThrow(usage);
});
