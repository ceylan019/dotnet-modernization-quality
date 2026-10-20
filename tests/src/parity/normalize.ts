export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type VolatileKind = 'referenceNumber' | 'timestamp';

const REFERENCE = /^PRM-\d{4}-\d{6}$/;
const ISO_DATE_TIME = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;

function isIsoDateTime(value: string): boolean {
  const m = ISO_DATE_TIME.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day;
}

function sortKeys(v: unknown): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
    return out;
  }
  return v as Json;
}

function placeholder(kind: VolatileKind, value: Json): string {
  const ok = typeof value === 'string' && (kind === 'referenceNumber'
    ? REFERENCE.test(value)
    : isIsoDateTime(value));
  if (ok) return `<${kind}>`;
  const shown = typeof value === 'string' ? value : JSON.stringify(value);
  return `<invalid ${kind}: ${shown}>`;
}

// "a.b[*].c" -> ['a', 'b', '*', 'c']
function segments(path: string): string[] {
  return path.replace(/\[\*\]/g, '.*').split('.').filter((s) => s !== '');
}

function mask(value: Json, segs: string[], kind: VolatileKind): Json {
  if (segs.length === 0) return placeholder(kind, value);
  const [head, ...rest] = segs;
  if (head === '*') {
    return Array.isArray(value) ? value.map((item) => mask(item, rest, kind)) : value;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && head! in value) {
    return { ...value, [head!]: mask(value[head!]!, rest, kind) };
  }
  return value;
}

function firstLine(message: unknown): string {
  return String(message ?? '').split(/\r?\n/)[0]!;
}

// Volatile paths are relative to the response `data` object.
export function normalizeResponse(
  res: { status: number; body: unknown },
  volatile: Record<string, VolatileKind> = {},
): Json {
  // A body that is not an object (text, an array, null) has no data or errors to read.
  const body = (res.body ?? {}) as Record<string, unknown>;
  let data = sortKeys(body.data ?? null);
  for (const [path, kind] of Object.entries(volatile)) data = mask(data, segments(path), kind);
  const rawErrors = Array.isArray(body.errors) ? body.errors : [];
  const errors = rawErrors.map((e: unknown) => {
    const err = (e ?? {}) as Record<string, unknown>;
    return { message: firstLine(err.message), path: sortKeys(err.path ?? null) };
  });
  return { status: res.status, data, errors };
}

export function normalizeValues(values: Record<string, string>): Json {
  return sortKeys(values);
}
