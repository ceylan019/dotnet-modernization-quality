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

// Own keys only, sorted. fromEntries keeps a key named __proto__ as a key.
function sortKeys(v: unknown): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return v as Json;
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

// The timestamp placeholder keeps the shape of the value (digits become d), so a change of
// offset or fractional precision stays visible while the instant itself is ignored.
function placeholder(kind: VolatileKind, value: Json): string {
  if (typeof value === 'string') {
    if (kind === 'referenceNumber' && REFERENCE.test(value)) return '<referenceNumber>';
    if (kind === 'timestamp' && isIsoDateTime(value)) return `<timestamp ${value.replace(/\d/g, 'd')}>`;
  }
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
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, head!)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === head ? mask(v, rest, kind) : v]));
  }
  return value;
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0]!;
}

function normalizeError(e: unknown): Json {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return `<invalid error: ${show(e)}>`;
  const err = e as Record<string, unknown>;
  const out: { [k: string]: Json } = {};
  if (Object.hasOwn(err, 'message')) {
    out.message = typeof err.message === 'string' ? firstLine(err.message) : `<invalid message: ${show(err.message)}>`;
  }
  if (Object.hasOwn(err, 'path')) out.path = sortKeys(err.path);
  return out;
}

// Volatile paths are relative to the response `data` object.
// Absent, null and empty stay three different normalized values: a missing `data` or `errors`
// key is left out, and a body that is not a JSON object is shown (with the start of `raw`).
export function normalizeResponse(
  res: { status: number; body: unknown; raw?: string },
  volatile: Record<string, VolatileKind> = {},
): Json {
  if (res.body === null || typeof res.body !== 'object' || Array.isArray(res.body)) {
    const text = res.raw ?? show(res.body);
    return { status: res.status, data: `<non-object body: ${text.slice(0, 200)}>` };
  }
  const body = res.body as Record<string, unknown>;
  const out: { [k: string]: Json } = { status: res.status };
  if (Object.hasOwn(body, 'data')) {
    let data = sortKeys(body.data);
    for (const [path, kind] of Object.entries(volatile)) data = mask(data, segments(path), kind);
    out.data = data;
  }
  if (Object.hasOwn(body, 'errors')) {
    out.errors = Array.isArray(body.errors) ? body.errors.map(normalizeError) : `<invalid errors: ${show(body.errors)}>`;
  }
  return sortKeys(out);
}

export function normalizeValues(values: Record<string, string>): Json {
  return sortKeys(values);
}
