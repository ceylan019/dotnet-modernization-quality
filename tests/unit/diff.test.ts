import { expect, it } from 'vitest';
import { diffJson } from '../src/parity/diff';

it('returns nothing for equal values', () => {
  expect(diffJson({ a: [1, { b: null }], c: 'x' }, { c: 'x', a: [1, { b: null }] })).toEqual([]);
  expect(diffJson(null, null)).toEqual([]);
  expect(diffJson(true, true)).toEqual([]);
});

it('reports a changed primitive with the root path', () => {
  expect(diffJson(1, 2)).toEqual([{ path: '$', kind: 'changed', expected: 1, actual: 2 }]);
  expect(diffJson('a', 'b')).toEqual([{ path: '$', kind: 'changed', expected: 'a', actual: 'b' }]);
  expect(diffJson(true, false)).toEqual([{ path: '$', kind: 'changed', expected: true, actual: false }]);
});

it('honours a custom start path', () => {
  expect(diffJson({ a: 1 }, { a: 2 }, '$.data')).toEqual([{ path: '$.data.a', kind: 'changed', expected: 1, actual: 2 }]);
});

it('reports every type pairing as type', () => {
  const values = [null, true, 1, 'x', [1], { a: 1 }];
  for (const [i, a] of values.entries()) {
    for (const [j, b] of values.entries()) {
      if (i === j) continue;
      expect(diffJson(a, b)).toEqual([{ path: '$', kind: 'type', expected: a, actual: b }]);
    }
  }
});

it('treats 1 and "1" as type, and 0 and false as type', () => {
  expect(diffJson({ v: 1 }, { v: '1' })[0]?.kind).toBe('type');
  expect(diffJson(0, false)[0]?.kind).toBe('type');
  expect(diffJson('', null)[0]?.kind).toBe('type');
});

it('reports a missing key with only expected', () => {
  const d = diffJson({ a: 1, b: 2 }, { a: 1 });
  expect(d).toEqual([{ path: '$.b', kind: 'missing', expected: 2 }]);
  expect('actual' in d[0]!).toBe(false);
});

it('reports an added key with only actual', () => {
  const d = diffJson({ a: 1 }, { a: 1, b: 2 });
  expect(d).toEqual([{ path: '$.b', kind: 'added', actual: 2 }]);
  expect('expected' in d[0]!).toBe(false);
});

it('keeps a key set to null distinct from a missing key', () => {
  expect(diffJson({ a: null }, {})).toEqual([{ path: '$.a', kind: 'missing', expected: null }]);
  expect(diffJson({}, { a: null })).toEqual([{ path: '$.a', kind: 'added', actual: null }]);
});

it('compares arrays by index', () => {
  expect(diffJson([1, 2, 3], [1, 9, 3])).toEqual([{ path: '$[1]', kind: 'changed', expected: 2, actual: 9 }]);
  expect(diffJson([{ a: 1 }], [{ a: 2 }])).toEqual([{ path: '$[0].a', kind: 'changed', expected: 1, actual: 2 }]);
});

it('reports a shorter array as missing items and a longer one as added items', () => {
  expect(diffJson([1, 2, 3], [1])).toEqual([
    { path: '$[1]', kind: 'missing', expected: 2 },
    { path: '$[2]', kind: 'missing', expected: 3 },
  ]);
  expect(diffJson([1], [1, 2, 3])).toEqual([
    { path: '$[1]', kind: 'added', actual: 2 },
    { path: '$[2]', kind: 'added', actual: 3 },
  ]);
});

it('does not ignore array order', () => {
  expect(diffJson(['a', 'b'], ['b', 'a'])).toHaveLength(2);
});

it('lists differences in expected key order then added keys', () => {
  const d = diffJson({ a: 1, b: 1 }, { z: 1, b: 2, a: 2 });
  expect(d.map((x) => x.path)).toEqual(['$.a', '$.b', '$.z']);
});

it('is case and whitespace sensitive', () => {
  expect(diffJson('Roy', 'roy')).toHaveLength(1);
  expect(diffJson('Roy', 'Roy ')).toHaveLength(1);
});

it('reports an empty array against an empty object as type', () => {
  expect(diffJson([], {})[0]?.kind).toBe('type');
  expect(diffJson({}, [])[0]?.kind).toBe('type');
});
