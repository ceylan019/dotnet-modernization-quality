import type { Json } from '../parity/normalize';

function toJson(value: unknown): Json {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
}

// The request a baseline case records. Whitespace in the document is layout only, so it is
// collapsed to keep baselines readable.
export function apiRequest(query: string, variables?: unknown): Json {
  return { query: query.replace(/\s+/g, ' ').trim(), variables: toJson(variables) };
}
