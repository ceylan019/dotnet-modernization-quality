import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { compareBaselineDirs, isDeterministic } from '../src/parity/compare-baseline-dirs';

function put(root: string, file: string, body: unknown): void {
  const path = join(root, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(body));
}

function pair(): [string, string] {
  return [mkdtempSync(join(tmpdir(), 'cmp-a-')), mkdtempSync(join(tmpdir(), 'cmp-b-'))];
}

it('ignores recordedAt and key order', () => {
  const [a, b] = pair();
  put(a, 'api/x.json', { suite: 'api', recordedAt: '2026-01-01T00:00:00Z', normalized: { a: 1, b: 2 } });
  put(b, 'api/x.json', { normalized: { b: 2, a: 1 }, recordedAt: '2027-02-02T00:00:00Z', suite: 'api' });
  const result = compareBaselineDirs(a, b);
  expect(result).toMatchObject({ files: 1, different: [] });
  expect(isDeterministic(result)).toBe(true);
});

it('reports a changed value', () => {
  const [a, b] = pair();
  put(a, 'api/x.json', { recordedAt: 'a', normalized: { n: 1 } });
  put(b, 'api/x.json', { recordedAt: 'b', normalized: { n: 2 } });
  const result = compareBaselineDirs(a, b);
  expect(result.different).toEqual(['api/x.json']);
  expect(result.firstDifferences['api/x.json']).toEqual({ path: '$.normalized.n', first: 1, second: 2 });
  expect(isDeterministic(result)).toBe(false);
});

it('reports files present in only one pass', () => {
  const [a, b] = pair();
  put(a, 'api/x.json', {});
  put(a, 'ui/only-a.json', {});
  put(b, 'api/x.json', {});
  put(b, 'ui/only-b.json', {});
  const result = compareBaselineDirs(a, b);
  expect(result.onlyInFirst).toEqual(['ui/only-a.json']);
  expect(result.onlyInSecond).toEqual(['ui/only-b.json']);
  expect(isDeterministic(result)).toBe(false);
});

it('skips the lighthouse and perf folders', () => {
  const [a, b] = pair();
  put(a, 'api/x.json', { v: 1 });
  put(b, 'api/x.json', { v: 1 });
  put(a, 'perf/summary.json', { ms: 1 });
  put(b, 'perf/summary.json', { ms: 2 });
  put(a, 'lighthouse/summary.json', { s: 1 });
  expect(isDeterministic(compareBaselineDirs(a, b))).toBe(true);
});

it('does not treat two empty folders as agreement', () => {
  const [a, b] = pair();
  expect(isDeterministic(compareBaselineDirs(a, b))).toBe(false);
});
