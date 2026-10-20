import type { Json } from '../parity/normalize';

function toJson(value: unknown): Json {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
}

// The request a baseline case records. Whitespace in the document is layout only, so it is
// collapsed to keep baselines readable.
export function apiRequest(query: string, variables?: unknown): Json {
  return { query: query.replace(/\s+/g, ' ').trim(), variables: toJson(variables) };
}

// The legacy API writes date-times with up to three fraction digits and drops trailing zeros
// (12:00:00.12 for .120, 12:00:00 for .000), so the digit count of a time created during the
// run changes from one run to the next. Such placeholders keep the date, time and offset shape
// and show the fraction as [.ddd]. Four or more fraction digits are left as they are.
const TRIMMED_FRACTION = /^<timestamp (dddd-dd-ddTdd:dd:dd)(?:\.d{1,3})?(Z|[+-]dd:dd)?>$/;

export function collapseTrimmedFractions(value: Json): Json {
  if (typeof value === 'string') {
    const m = TRIMMED_FRACTION.exec(value);
    return m ? `<timestamp ${m[1]}[.ddd]${m[2] ?? ''}>` : value;
  }
  if (Array.isArray(value)) return value.map(collapseTrimmedFractions);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, collapseTrimmedFractions(v)]));
  }
  return value;
}
