import type { TestInfo } from '@playwright/test';
import { loadEnv } from '../config/env';
import { expectParity } from '../parity/expect-parity';
import { normalizeResponse, type Json, type VolatileKind } from '../parity/normalize';
import { apiRequest } from './api-normalize';
import type { GraphQLClient, GraphQLResponse } from './graphql-client';

export interface ApiCase {
  suite: string;
  caseId: string;
  risks: string[];
  query: string;
  variables?: Record<string, unknown>;
  // Recorded instead of `variables` when these hold values created during the run, such as
  // the reference number of a new submission.
  recordedVariables?: Record<string, Json>;
  // Paths relative to `data`, see normalizeResponse.
  volatile?: Record<string, VolatileKind>;
}

export function apiTags(risks: readonly string[]): string[] {
  return ['@api', '@parity', ...risks.map((r) => `@${r}`)];
}

// True while recording legacy baselines. Checks of exact legacy values (message wording, list
// order) run only then: in compare mode parity owns those values, so an approved difference
// can accept them.
export function recording(): boolean {
  return loadEnv().parityMode === 'record';
}

// Sends one GraphQL request and compares (or records) its normalized response.
export async function runApiCase(
  gql: Pick<GraphQLClient, 'send'>,
  testInfo: Pick<TestInfo, 'annotations'>,
  c: ApiCase,
): Promise<GraphQLResponse> {
  const res = await gql.send(c.query, c.variables);
  expectParity(testInfo as TestInfo, {
    suite: c.suite,
    caseId: c.caseId,
    risks: c.risks,
    request: apiRequest(c.query, c.recordedVariables ?? c.variables),
    actual: normalizeResponse(res, c.volatile),
  });
  return res;
}

interface Envelope {
  data?: Record<string, unknown> | null;
  errors?: { message?: unknown }[];
}

// A body that is not JSON is null; property reads on any other JSON value are safe.
function envelope(res: GraphQLResponse): Envelope {
  return (res.body ?? {}) as Envelope;
}

// Holds in both modes: an HTTP 200 answer with data and no errors.
export function expectData(res: GraphQLResponse): Record<string, unknown> {
  const body = envelope(res);
  if (res.status !== 200 || body.errors !== undefined || !body.data) {
    throw new Error(`Expected data without errors (HTTP 200), got HTTP ${res.status}: ${res.raw}`);
  }
  return body.data;
}

// Holds in both modes: at least one GraphQL error. Returns the messages.
export function expectErrors(res: GraphQLResponse): string[] {
  const errors = envelope(res).errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    throw new Error(`Expected GraphQL errors, got HTTP ${res.status}: ${res.raw}`);
  }
  return errors.map((e) => String(e?.message ?? ''));
}
