import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { afterEach, expect, it } from 'vitest';
import { apiRequest } from '../src/api/api-normalize';
import { GraphQLClient, type GraphQLResponse } from '../src/api/graphql-client';
import { apiTags, expectData, expectErrors, recording, runApiCase } from '../src/api/parity-case';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

function useEnv(mode: 'record' | 'compare'): string {
  const dir = mkdtempSync(join(tmpdir(), 'api-case-'));
  Object.assign(process.env, { TARGET: 'legacy', BASE_URL: 'http://localhost:8081', PARITY_MODE: mode, BASELINES_DIR: dir });
  delete process.env.APPROVED_DIFFERENCES_FILE;
  return dir;
}

function parsed(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const response = (status: number, raw: string): GraphQLResponse => ({ status, body: parsed(raw), raw });
const fakeGql = (res: GraphQLResponse) => {
  const sent: unknown[][] = [];
  return { sent, send: async (...args: unknown[]) => { sent.push(args); return res; } };
};
const fakeInfo = () => ({ annotations: [] as { type: string; description?: string }[] });

it('GraphQLClient posts the query and variables to its URL and parses JSON', async () => {
  const posts: { url: string; options: unknown }[] = [];
  const request = {
    post: async (url: string, options: unknown) => {
      posts.push({ url, options });
      return { status: () => 200, text: async () => '{"data":{"a":1}}' };
    },
  } as unknown as APIRequestContext;
  const res = await new GraphQLClient(request, 'http://x/graphql').send('{ a }', { v: 1 });
  expect(posts).toEqual([{ url: 'http://x/graphql', options: { data: { query: '{ a }', variables: { v: 1 } } } }]);
  expect(res).toEqual({ status: 200, body: { data: { a: 1 } }, raw: '{"data":{"a":1}}' });
});

it('GraphQLClient keeps a body that is not JSON as raw text with a null body', async () => {
  const request = { post: async () => ({ status: () => 400, text: async () => 'Invalid request' }) } as unknown as APIRequestContext;
  expect(await new GraphQLClient(request, '/graphql').send('{ a }')).toEqual({ status: 400, body: null, raw: 'Invalid request' });
});

it('records the request with layout whitespace collapsed and variables as JSON', () => {
  expect(apiRequest('query Q {\n  a\n    b }', { x: 1, skip: undefined })).toEqual({ query: 'query Q { a b }', variables: { x: 1 } });
  expect(apiRequest(' { a } ')).toEqual({ query: '{ a }', variables: null });
});

it('tags an API parity test with @api, @parity and each risk', () => {
  expect(apiTags(['RISK-FEE-01', 'RISK-API-03'])).toEqual(['@api', '@parity', '@RISK-FEE-01', '@RISK-API-03']);
  expect(apiTags([])).toEqual(['@api', '@parity']);
});

it('recording() follows PARITY_MODE', () => {
  useEnv('record');
  expect(recording()).toBe(true);
  useEnv('compare');
  expect(recording()).toBe(false);
});

it('runApiCase records the normalized response with recorded variables and volatile paths', async () => {
  const dir = useEnv('record');
  const res = response(200, '{"data":{"application":{"referenceNumber":"PRM-2026-000501","at":"2026-10-20T10:35:56.77"}}}');
  const gql = fakeGql(res);
  const info = fakeInfo();
  const returned = await runApiCase(gql, info, {
    suite: 'workflow',
    caseId: 'a-submit-state',
    risks: ['RISK-WF-01'],
    query: 'query Application($r: String!) {\n  application(referenceNumber: $r) { referenceNumber }\n}',
    variables: { r: 'PRM-2026-000501' },
    recordedVariables: { r: '<new application a>' },
    volatile: { 'application.referenceNumber': 'referenceNumber', 'application.at': 'timestamp' },
  });
  expect(returned).toBe(res);
  expect(gql.sent).toEqual([[
    'query Application($r: String!) {\n  application(referenceNumber: $r) { referenceNumber }\n}',
    { r: 'PRM-2026-000501' },
  ]]);
  const written = JSON.parse(readFileSync(join(dir, 'workflow', 'a-submit-state.json'), 'utf8'));
  expect(written.request).toEqual({
    query: 'query Application($r: String!) { application(referenceNumber: $r) { referenceNumber } }',
    variables: { r: '<new application a>' },
  });
  expect(written.normalized).toEqual({
    data: { application: { at: '<timestamp dddd-dd-ddTdd:dd:dd[.ddd]>', referenceNumber: '<referenceNumber>' } },
    status: 200,
  });
  expect(written.risks).toEqual(['RISK-WF-01']);
  expect(info.annotations).toEqual([{ type: 'baseline-recorded', description: 'workflow/a-submit-state' }]);
});

it('runApiCase records the sent variables when no recorded ones are given, and compares later', async () => {
  const dir = useEnv('record');
  const res = response(200, '{"data":{"feeQuote":{"feeAmount":175.15}}}');
  const c = { suite: 'fee', caseId: 'fee-reno-10.70-none', risks: ['RISK-FEE-01'], query: '{ q }', variables: { area: 10.7 } };
  await runApiCase(fakeGql(res), fakeInfo(), c);
  expect(JSON.parse(readFileSync(join(dir, 'fee', 'fee-reno-10.70-none.json'), 'utf8')).request).toEqual({ query: '{ q }', variables: { area: 10.7 } });

  process.env.PARITY_MODE = 'compare';
  const info = fakeInfo();
  await runApiCase(fakeGql(res), info, c);
  expect(info.annotations).toEqual([{ type: 'evidence', description: 'parity=1' }]);
  await expect(runApiCase(fakeGql(response(200, '{"data":{"feeQuote":{"feeAmount":175.14}}}')), fakeInfo(), c))
    .rejects.toThrow('$.data.feeQuote.feeAmount (changed) expected 175.15 actual 175.14');
});

it('expectData returns data only for HTTP 200 without errors', () => {
  expect(expectData(response(200, '{"data":{"a":1}}'))).toEqual({ a: 1 });
  expect(() => expectData(response(500, '{"data":{"a":1}}'))).toThrow('Expected data without errors (HTTP 200), got HTTP 500: {"data":{"a":1}}');
  expect(() => expectData(response(200, '{"data":{"a":1},"errors":[]}'))).toThrow('got HTTP 200');
  expect(() => expectData(response(200, '{"data":null}'))).toThrow('got HTTP 200: {"data":null}');
  expect(() => expectData(response(200, 'not json'))).toThrow('got HTTP 200: not json');
  expect(() => expectData(response(200, '"text"'))).toThrow('got HTTP 200: "text"');
});

it('expectErrors returns the messages and refuses a response without errors', () => {
  expect(expectErrors(response(200, '{"data":null,"errors":[{"message":"a"},{"path":["x"]},null]}'))).toEqual(['a', '', '']);
  expect(() => expectErrors(response(200, '{"data":{"a":1}}'))).toThrow('Expected GraphQL errors, got HTTP 200: {"data":{"a":1}}');
  expect(() => expectErrors(response(200, '{"errors":[]}'))).toThrow('Expected GraphQL errors');
  expect(() => expectErrors(response(400, 'Invalid request'))).toThrow('got HTTP 400: Invalid request');
  expect(() => expectErrors(response(200, '{"errors":{"message":"a"}}'))).toThrow('Expected GraphQL errors');
});
