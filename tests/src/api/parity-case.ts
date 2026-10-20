import { expect, type TestInfo } from '@playwright/test';
import { expectParity } from '../parity/expect-parity';
import { normalizeResponse, type Json, type VolatileKind } from '../parity/normalize';
import { apiRequest, collapseTrimmedFractions } from './api-normalize';
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

// Sends one GraphQL request and compares (or records) its normalized response.
export async function runApiCase(gql: GraphQLClient, testInfo: TestInfo, c: ApiCase): Promise<GraphQLResponse> {
  const res = await gql.send(c.query, c.variables);
  expectParity(testInfo, {
    suite: c.suite,
    caseId: c.caseId,
    risks: c.risks,
    request: apiRequest(c.query, c.recordedVariables ?? c.variables),
    actual: collapseTrimmedFractions(normalizeResponse(res, c.volatile)),
  });
  return res;
}

interface Envelope {
  data?: Record<string, unknown> | null;
  errors?: { message?: unknown }[];
}

// Plausibility checks next to parity, so a record run cannot quietly store a broken response.
export function expectData(res: GraphQLResponse): Record<string, unknown> {
  expect(res.status, res.raw).toBe(200);
  const body = res.body as Envelope | null;
  expect(body?.errors, res.raw).toBeUndefined();
  expect(body?.data, res.raw).toBeTruthy();
  return body!.data!;
}

export function expectErrors(res: GraphQLResponse): string[] {
  const body = res.body as Envelope | null;
  expect(Array.isArray(body?.errors) && body!.errors!.length > 0, res.raw).toBe(true);
  return body!.errors!.map((e) => String(e.message ?? ''));
}
