import { expect, it } from 'vitest';
import { diffJson } from '../src/parity/diff';
import { normalizeResponse, normalizeValues, type Json } from '../src/parity/normalize';

// normalizeResponse is typed as Json but always returns this object shape.
const norm = (...a: Parameters<typeof normalizeResponse>) =>
  normalizeResponse(...a) as { status: number; data: Json; errors: Json };
const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, body: { data, ...extra } });

it('keeps a leading space in a value, so " Roy" differs from "Roy"', () => {
  const a = norm(ok({ name: ' Roy' }));
  const b = norm(ok({ name: 'Roy' }));
  expect(a).toEqual({ status: 200, data: { name: ' Roy' }, errors: [] });
  expect(diffJson(b, a)).toEqual([{ path: '$.data.name', kind: 'changed', expected: 'Roy', actual: ' Roy' }]);
});

it('keeps trailing whitespace and case untouched', () => {
  expect(norm(ok({ n: 'Roy ', m: 'ROY' })).data).toEqual({ m: 'ROY', n: 'Roy ' });
});

it('keeps a string number distinct from a number', () => {
  const s = norm(ok({ fee: '174.67' }));
  const n = norm(ok({ fee: 174.67 }));
  expect(diffJson(s, n)).toEqual([{ path: '$.data.fee', kind: 'type', expected: '174.67', actual: 174.67 }]);
});

it('does not reformat numbers', () => {
  expect(norm(ok({ fee: 10.7 })).data).toEqual({ fee: 10.7 });
  expect(norm(ok({ fee: 10 })).data).toEqual({ fee: 10 });
});

it('keeps array order so reordered arrays produce changed differences', () => {
  const a = norm(ok({ ids: [1, 2] }));
  const b = norm(ok({ ids: [2, 1] }));
  expect(a.data).toEqual({ ids: [1, 2] });
  expect(diffJson(a, b).map((d) => [d.path, d.kind])).toEqual([
    ['$.data.ids[0]', 'changed'],
    ['$.data.ids[1]', 'changed'],
  ]);
});

it('sorts object keys at every depth', () => {
  const r = norm(ok({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }));
  expect(Object.keys(r)).toEqual(['status', 'data', 'errors']);
  const data = r.data as Record<string, unknown>;
  expect(Object.keys(data)).toEqual(['a', 'b']);
  const a = data.a as Record<string, unknown>;
  expect(Object.keys(a)).toEqual(['c', 'd']);
  expect(Object.keys((a.c as Record<string, unknown>[])[0]!)).toEqual(['y', 'z']);
});

it('reduces an error to the first line of its message and its path', () => {
  const body = {
    data: null,
    errors: [{
      message: 'Invalid status transition from Approved to UnderReview\n   at Permits.Core.Workflow.Move()\n   at X',
      locations: [{ line: 1, column: 2 }],
      extensions: { code: 'X', exception: { stackTrace: 'big' } },
      path: ['updateStatus'],
    }],
  };
  expect(norm({ status: 200, body })).toEqual({
    status: 200,
    data: null,
    errors: [{ message: 'Invalid status transition from Approved to UnderReview', path: ['updateStatus'] }],
  });
});

it('handles CRLF in the first line and an error without a path', () => {
  const r = norm({ status: 200, body: { errors: [{ message: 'Boom \r\nstack' }] } });
  expect(r.errors).toEqual([{ message: 'Boom ', path: null }]);
});

it('does not trim the first line of an error message', () => {
  const r = norm({ status: 200, body: { errors: [{ message: '  padded  ' }] } });
  expect(r.errors).toEqual([{ message: '  padded  ', path: null }]);
});

it('reports data null and no errors for a non-object body', () => {
  expect(norm({ status: 502, body: 'Bad gateway' })).toEqual({ status: 502, data: null, errors: [] });
  expect(norm({ status: 500, body: null })).toEqual({ status: 500, data: null, errors: [] });
  expect(norm({ status: 500, body: [1] })).toEqual({ status: 500, data: null, errors: [] });
});

it('replaces a valid reference number at a volatile path', () => {
  const r = norm(ok({ p: { ref: 'PRM-2026-000123' } }), { 'p.ref': 'referenceNumber' });
  expect(r.data).toEqual({ p: { ref: '<referenceNumber>' } });
});

it('flags an invalid reference number with its value', () => {
  for (const bad of ['PRM-2026-12345', 'PRM-2026-0001234', 'xPRM-2026-000123', 'PRM-2026-000123x', 'prm-2026-000123', 'PRM-26-000123']) {
    const r = norm(ok({ ref: bad }), { ref: 'referenceNumber' });
    expect(r.data).toEqual({ ref: `<invalid referenceNumber: ${bad}>` });
  }
});

it('flags non-string values at a volatile path', () => {
  expect(norm(ok({ ref: null }), { ref: 'referenceNumber' }).data).toEqual({ ref: '<invalid referenceNumber: null>' });
  expect(norm(ok({ ref: 5 }), { ref: 'referenceNumber' }).data).toEqual({ ref: '<invalid referenceNumber: 5>' });
});

it('replaces valid ISO timestamps and flags others', () => {
  const v = { t: 'timestamp' } as const;
  for (const good of ['2026-10-15T10:20:30Z', '2026-10-15T10:20:30.123Z', '2026-10-15T10:20:30+02:00', '2026-10-15T10:20:30', '2026-10-15T10:20:30.1234567']) {
    expect(norm(ok({ t: good }), v).data).toEqual({ t: '<timestamp>' });
  }
  for (const bad of ['2026-10-15', 'yesterday', '2026-13-15T10:20:30Z', '2026-10-15T25:20:30Z', ' 2026-10-15T10:20:30Z', '2026-10-15T10:20:30Z ', '15/10/2026 10:20', 'x2026-10-15T10:20:30Z']) {
    expect(norm(ok({ t: bad }), v).data).toEqual({ t: `<invalid timestamp: ${bad}>` });
  }
});

it('supports [*] for array items and nested wildcards', () => {
  const data = { permits: [{ ref: 'PRM-2026-000001', at: '2026-10-15T00:00:00Z', other: 'a' }, { ref: 'PRM-2026-000002', at: 'nope', other: 'b' }], keep: 'PRM-2026-000009' };
  const r = norm(ok(data), { 'permits[*].ref': 'referenceNumber', 'permits[*].at': 'timestamp' });
  expect(r.data).toEqual({
    keep: 'PRM-2026-000009',
    permits: [
      { at: '<timestamp>', other: 'a', ref: '<referenceNumber>' },
      { at: '<invalid timestamp: nope>', other: 'b', ref: '<referenceNumber>' },
    ],
  });
  const nested = norm(ok({ g: [[{ t: '2026-10-15T00:00:00Z' }]] }), { 'g[*][*].t': 'timestamp' });
  expect(nested.data).toEqual({ g: [[{ t: '<timestamp>' }]] });
});

it('ignores volatile paths that are absent or hit the wrong shape', () => {
  expect(norm(ok({ a: 1 }), { 'b.c': 'timestamp' }).data).toEqual({ a: 1 });
  expect(norm(ok({ a: 1 }), { 'a.c': 'timestamp' }).data).toEqual({ a: 1 });
  expect(norm(ok({ a: { c: 1 } }), { 'a[*]': 'timestamp' }).data).toEqual({ a: { c: 1 } });
  expect(norm(ok({ a: [1] }), { a: 'timestamp' }).data).toEqual({ a: '<invalid timestamp: [1]>' });
  expect(norm(ok(null), { a: 'timestamp' }).data).toBeNull();
});

it('does not touch values outside the volatile paths', () => {
  const r = norm(ok({ ref: 'PRM-2026-000001', other: 'PRM-2026-000001' }), { ref: 'referenceNumber' });
  expect(r.data).toEqual({ other: 'PRM-2026-000001', ref: '<referenceNumber>' });
});

it('does not mutate its input', () => {
  const body = { data: { b: 1, a: 'PRM-2026-000001' } };
  norm({ status: 200, body }, { a: 'referenceNumber' });
  expect(body).toEqual({ data: { b: 1, a: 'PRM-2026-000001' } });
  expect(Object.keys(body.data)).toEqual(['b', 'a']);
});

it('normalizeValues sorts keys and leaves values alone', () => {
  const r = normalizeValues({ b: ' x ', a: '', c: '174.67' });
  expect(Object.keys(r as object)).toEqual(['a', 'b', 'c']);
  expect(r).toEqual({ a: '', b: ' x ', c: '174.67' });
});

it('rejects impossible calendar dates and out of range times in timestamps', () => {
  const v = { t: 'timestamp' } as const;
  for (const bad of ['2026-02-30T10:00:00Z', '2026-04-31T10:00:00Z', '2026-00-10T10:00:00Z', '2026-10-00T10:00:00Z', '2026-10-32T10:00:00Z', '2026-10-15T10:60:00Z', '2026-10-15T10:00:60Z', '2026-10-15T10:00:00+24:00', '2026-10-15T10:00:00+02:60', '2026-10-15T10:00Z']) {
    expect(norm(ok({ t: bad }), v).data).toEqual({ t: `<invalid timestamp: ${bad}>` });
  }
  for (const good of ['2028-02-29T10:00:00Z', '2026-10-31T23:59:59-05:30', '2026-01-01T00:00:00']) {
    expect(norm(ok({ t: good }), v).data).toEqual({ t: '<timestamp>' });
  }
});

it('supports a leading [*] on array data', () => {
  const r = norm(ok([{ t: '2026-10-15T00:00:00Z' }, { t: 'x' }]), { '[*].t': 'timestamp' });
  expect(r.data).toEqual([{ t: '<timestamp>' }, { t: '<invalid timestamp: x>' }]);
});

it('uses an empty message when an error has none', () => {
  expect(norm({ status: 200, body: { errors: [{}, null] } }).errors).toEqual([
    { message: '', path: null },
    { message: '', path: null },
  ]);
});

it('ignores data and errors on a string or array body', () => {
  expect(norm({ status: 200, body: 'data' })).toEqual({ status: 200, data: null, errors: [] });
  expect(norm({ status: 200, body: undefined })).toEqual({ status: 200, data: null, errors: [] });
});

it('sorts keys inside error paths', () => {
  const r = norm({ status: 200, body: { errors: [{ message: 'x', path: ['a', 1] }] } });
  expect(r.errors).toEqual([{ message: 'x', path: ['a', 1] }]);
});
