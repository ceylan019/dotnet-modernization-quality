import { buildSchema, introspectionFromSchema, type IntrospectionQuery } from 'graphql';
import { expect, it } from 'vitest';
import { apiRequest, collapseTrimmedFractions } from '../src/api/api-normalize';
import { compareSchemas } from '../src/api/schema-contract';
import type { ApprovedDifference } from '../src/parity/approved-differences';
import { diffJson } from '../src/parity/diff';
import { normalizeResponse } from '../src/parity/normalize';

const BASE = `
  type Query {
    feeQuote(permitTypeCode: String!, areaSqM: Decimal!): FeeQuote
    application(referenceNumber: String!): Application
  }
  type Mutation { submitApplication(input: ApplicationInput!): String }
  type FeeQuote { feeAmount: Decimal! totalAmount: Decimal! }
  type Application { referenceNumber: String! status: ApplicationStatus }
  enum ApplicationStatus { SUBMITTED UNDER_REVIEW EXPIRED }
  input ApplicationInput { firstName: String! email: String }
  scalar Decimal
  scalar Seconds
`;

const intro = (sdl: string): IntrospectionQuery => introspectionFromSchema(buildSchema(sdl));
const approval = (path: string, id = 'AD-1'): ApprovedDifference => ({
  id, suite: 'schema', caseId: 'introspection', path, reason: 'accepted', approvedBy: 'owner', approvedOn: '2026-10-20',
});
const compare = (live: string, approved: ApprovedDifference[] = []) =>
  compareSchemas(intro(BASE), intro(live), approved, 'schema', 'introspection');
const paths = (live: string): string[] => compare(live).unapproved.map((u) => u.path);

it('finds nothing when the schema is unchanged, and counts the recorded types', () => {
  const result = compare(BASE);
  expect(result.unapproved).toEqual([]);
  // Query, Mutation, FeeQuote, Application, ApplicationStatus, ApplicationInput, Decimal,
  // Seconds, String and Boolean (introspection types left out).
  expect(result.recordedTypes).toBe(10);
});

it('allows additions: a new type, field, optional argument and enum value', () => {
  const live = BASE
    .replace('totalAmount: Decimal!', 'totalAmount: Decimal! hstAmount: Decimal!')
    .replace('areaSqM: Decimal!)', 'areaSqM: Decimal!, currency: String)')
    .replace('EXPIRED }', 'EXPIRED WITHDRAWN }')
    .concat('\n type Extra { a: Int }');
  expect(paths(live)).toEqual([]);
});

it('names a removed field, a removed enum value and a removed type by schema path', () => {
  const live = BASE
    .replace(' totalAmount: Decimal!', '')
    .replace(' EXPIRED', '')
    .replace('scalar Seconds', '');
  expect(paths(live).sort()).toEqual(['schema:ApplicationStatus.EXPIRED', 'schema:FeeQuote.totalAmount', 'schema:Seconds']);
});

it('reports nullability and argument changes on the field they belong to', () => {
  const live = BASE
    .replace('feeAmount: Decimal!', 'feeAmount: Decimal')
    .replace('areaSqM: Decimal!)', 'areaSqM: Float!)')
    .replace('(referenceNumber: String!)', '(referenceNumber: String!, year: Int!)');
  expect(paths(live).sort()).toEqual(['schema:FeeQuote.feeAmount', 'schema:Query.application', 'schema:Query.feeQuote']);
});

it('reports a new required input field on the input type', () => {
  expect(paths(BASE.replace('email: String }', 'email: String phone: String! }'))).toEqual(['schema:ApplicationInput.phone']);
});

it('lets an approval cover exactly its path and reports which approvals applied', () => {
  const live = BASE.replace(' totalAmount: Decimal!', '').replace('scalar Seconds', '');
  const result = compare(live, [approval('schema:Seconds', 'AD-7'), approval('schema:FeeQuote.feeAmount', 'AD-8')]);
  expect(result.unapproved.map((u) => u.path)).toEqual(['schema:FeeQuote.totalAmount']);
  expect(result.applied).toEqual(['AD-7']);
});

it('ignores approvals recorded for another suite or case', () => {
  const live = BASE.replace('scalar Seconds', '');
  const other = { ...approval('schema:Seconds'), caseId: 'other' };
  expect(compare(live, [other]).unapproved.map((u) => u.path)).toEqual(['schema:Seconds']);
});

it('collapses a fraction of up to three digits in volatile timestamps only', () => {
  const res = {
    status: 200,
    body: {
      data: {
        a: '2026-10-20T10:35:56',
        b: '2026-10-20T10:35:56.77',
        c: '2026-10-20T10:35:56.767',
        d: '2026-10-20T10:35:56.7671234',
        e: '2026-10-20T10:35:56.767-04:00',
        seeded: '2026-09-03T08:10:53',
      },
    },
  };
  const volatile = { a: 'timestamp', b: 'timestamp', c: 'timestamp', d: 'timestamp', e: 'timestamp' } as const;
  expect(collapseTrimmedFractions(normalizeResponse(res, volatile))).toEqual({
    status: 200,
    data: {
      a: '<timestamp dddd-dd-ddTdd:dd:dd[.ddd]>',
      b: '<timestamp dddd-dd-ddTdd:dd:dd[.ddd]>',
      c: '<timestamp dddd-dd-ddTdd:dd:dd[.ddd]>',
      d: '<timestamp dddd-dd-ddTdd:dd:dd.ddddddd>',
      e: '<timestamp dddd-dd-ddTdd:dd:dd[.ddd]-dd:dd>',
      seeded: '2026-09-03T08:10:53',
    },
  });
});

it('keeps an offset difference visible after collapsing', () => {
  const at = (v: string) => collapseTrimmedFractions(normalizeResponse({ status: 200, body: { data: { t: v } } }, { t: 'timestamp' }));
  expect(diffJson(at('2026-10-20T10:35:56.1'), at('2026-10-20T10:35:56.100Z'))).toHaveLength(1);
  expect(diffJson(at('2026-10-20T10:35:56.1'), at('2026-10-20T10:35:56'))).toEqual([]);
});

it('records the request with layout whitespace collapsed and variables as JSON', () => {
  expect(apiRequest('query Q {\n  a\n    b }', { x: 1, skip: undefined })).toEqual({ query: 'query Q { a b }', variables: { x: 1 } });
  expect(apiRequest(' { a } ')).toEqual({ query: '{ a }', variables: null });
});
