import { buildClientSchema, parse, validate, type IntrospectionQuery } from 'graphql';
import { apiRequest } from '../../src/api/api-normalize';
import * as operations from '../../src/api/operations';
import { apiTags, expectData, expectErrors, runApiCase } from '../../src/api/parity-case';
import { compareSchemas } from '../../src/api/schema-contract';
import { expect, test } from '../../src/fixtures';
import { loadApprovedDifferences } from '../../src/parity/approved-differences';
import { readBaselineCase } from '../../src/parity/baseline-store';
import { diffJson } from '../../src/parity/diff';
import { expectParity } from '../../src/parity/expect-parity';
import { normalizeResponse } from '../../src/parity/normalize';

const SCHEMA_SUITE = 'schema';
const SCHEMA_CASE = 'introspection';
const CONTRACT_RISKS = ['RISK-API-01'];
const ERROR_SUITE = 'graphql-errors';
const ERROR_RISKS = ['RISK-API-02'];

// Record mode stores the legacy introspection result. Compare mode does not diff it value by
// value (the modern API may add types and fields): it builds both schemas and fails on every
// breaking change that approved-differences.json does not list as schema:<type>.<field>.
test('schema has no unapproved breaking changes', { tag: apiTags(CONTRACT_RISKS) }, async ({ gql, env }, testInfo) => {
  const res = await gql.send(operations.INTROSPECTION);
  const live = expectData(res) as unknown as IntrospectionQuery;
  const request = apiRequest(operations.INTROSPECTION);

  if (env.parityMode === 'record') {
    expectParity(testInfo, {
      suite: SCHEMA_SUITE, caseId: SCHEMA_CASE, risks: CONTRACT_RISKS, request, actual: normalizeResponse(res),
    });
    return;
  }

  const baseline = readBaselineCase(SCHEMA_SUITE, SCHEMA_CASE);
  if (!baseline) throw new Error(`No legacy baseline for ${SCHEMA_SUITE}/${SCHEMA_CASE}`);
  expect(diffJson(baseline.request, request, '$request'), 'introspection request differs from the recorded one, re-record the baseline').toEqual([]);

  const recorded = (baseline.normalized as { data?: unknown }).data as IntrospectionQuery;
  const approved = loadApprovedDifferences(process.env.APPROVED_DIFFERENCES_FILE || undefined);
  const result = compareSchemas(recorded, live, approved, SCHEMA_SUITE, SCHEMA_CASE);
  testInfo.annotations.push({ type: 'evidence', description: `schema-types=${result.recordedTypes}` });
  for (const id of result.applied) testInfo.annotations.push({ type: 'approved-difference', description: id });
  expect(result.unapproved.map((u) => `${u.path}: ${u.change.description}`)).toEqual([]);
});

// Every document the suites send must stay valid against the app under test.
test('every operation document validates against the live schema', { tag: ['@api', ...CONTRACT_RISKS.map((r) => `@${r}`)] }, async ({ gql }) => {
  const res = await gql.send(operations.INTROSPECTION);
  const schema = buildClientSchema(expectData(res) as unknown as IntrospectionQuery);
  const documents = Object.entries(operations).filter(([, doc]) => typeof doc === 'string');
  expect(documents.length).toBeGreaterThan(0);
  for (const [name, doc] of documents) {
    expect(validate(schema, parse(doc)).map((e) => e.message), name).toEqual([]);
  }
});

test('a query selecting an unknown field', { tag: apiTags(ERROR_RISKS) }, async ({ gql }, testInfo) => {
  const res = await runApiCase(gql, testInfo, {
    suite: ERROR_SUITE,
    caseId: 'unknown-field',
    risks: ERROR_RISKS,
    query: 'query UnknownField { permitTypes { code colour } }',
  });
  expectErrors(res);
});

test('a request body that is not JSON', { tag: apiTags(ERROR_RISKS) }, async ({ request, env }, testInfo) => {
  const sent = '{not json';
  const response = await request.post(env.graphqlUrl, { headers: { 'content-type': 'application/json' }, data: sent });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Not JSON: normalizeResponse shows the start of the raw text instead.
  }
  expectParity(testInfo, {
    suite: ERROR_SUITE,
    caseId: 'malformed-body',
    risks: ERROR_RISKS,
    request: { body: sent },
    actual: normalizeResponse({ status: response.status(), body, raw }),
  });
  expect(response.status(), raw).toBeGreaterThanOrEqual(400);
});
