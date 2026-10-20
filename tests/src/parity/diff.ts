import type { Json } from './normalize';

export interface Difference {
  path: string;
  kind: 'changed' | 'missing' | 'added' | 'type';
  expected?: Json;
  actual?: Json;
}

type Shape = 'null' | 'array' | 'object' | 'boolean' | 'number' | 'string';

function shapeOf(v: Json): Shape {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v as Shape;
}

export function diffJson(expected: Json, actual: Json, path = '$'): Difference[] {
  const se = shapeOf(expected);
  if (se !== shapeOf(actual)) return [{ path, kind: 'type', expected, actual }];

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const out: Difference[] = [];
    const n = Math.max(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
      const p = `${path}[${i}]`;
      if (i >= actual.length) out.push({ path: p, kind: 'missing', expected: expected[i] });
      else if (i >= expected.length) out.push({ path: p, kind: 'added', actual: actual[i] });
      else out.push(...diffJson(expected[i]!, actual[i]!, p));
    }
    return out;
  }

  if (se === 'object') {
    const e = expected as { [k: string]: Json };
    const a = actual as { [k: string]: Json };
    const out: Difference[] = [];
    for (const key of Object.keys(e)) {
      const p = `${path}.${key}`;
      if (!(key in a)) out.push({ path: p, kind: 'missing', expected: e[key]! });
      else out.push(...diffJson(e[key]!, a[key]!, p));
    }
    for (const key of Object.keys(a)) {
      if (!(key in e)) out.push({ path: `${path}.${key}`, kind: 'added', actual: a[key]! });
    }
    return out;
  }

  return expected === actual ? [] : [{ path, kind: 'changed', expected, actual }];
}
