import { expect, test } from '@playwright/test';
import { GraphQLClient } from '../src/api/graphql-client';
import {
  APPLICATION,
  CHANGE_STATUS,
  DUE_DATE,
  FEE_QUOTE,
  INTROSPECTION,
  PERMIT_TYPES,
  SEARCH,
  SUBMIT,
} from '../src/api/operations';
import { loadCatalog } from '../src/catalog';

const catalog = loadCatalog();

interface Envelope {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

async function run(client: GraphQLClient, query: string, variables?: Record<string, unknown>) {
  const result = await client.send(query, variables);
  expect(result.status, result.raw).toBe(200);
  const body = result.body as Envelope;
  expect(body.errors, result.raw).toBeUndefined();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return body.data as Record<string, any>;
}

test.describe('legacy GraphQL API', { tag: '@smoke' }, () => {
  test('permitTypes', async ({ request }) => {
    const data = await run(new GraphQLClient(request, '/graphql'), PERMIT_TYPES);
    expect(data.permitTypes).toHaveLength(6);
  });

  test('feeQuote', async ({ request }) => {
    const data = await run(new GraphQLClient(request, '/graphql'), FEE_QUOTE, {
      permitTypeCode: 'RENO',
      areaSqM: 50,
      isSenior: false,
      isNonProfit: false,
    });
    expect(data.feeQuote.totalAmount).toBeGreaterThan(0);
  });

  test('dueDate', async ({ request }) => {
    const data = await run(new GraphQLClient(request, '/graphql'), DUE_DATE, {
      permitTypeCode: 'RENO',
      submittedOn: '2026-10-15',
    });
    expect(data.dueDate).toBeTruthy();
  });

  test('application', async ({ request }) => {
    const reference = catalog.categories.statusApproved[0];
    const data = await run(new GraphQLClient(request, '/graphql'), APPLICATION, {
      referenceNumber: reference,
    });
    expect(data.application.referenceNumber).toBe(reference);
    expect(data.application.history.length).toBeGreaterThan(0);
  });

  test('application of an inactive permit type has a null permitType', async ({ request }) => {
    const reference = catalog.categories.inactivePermitType[0];
    const data = await run(new GraphQLClient(request, '/graphql'), APPLICATION, {
      referenceNumber: reference,
    });
    expect(data.application.referenceNumber).toBe(reference);
    expect(data.application.permitType).toBeNull();
  });

  test('searchApplications', async ({ request }) => {
    const data = await run(new GraphQLClient(request, '/graphql'), SEARCH, {
      searchText: null,
      status: 'SUBMITTED',
      page: 1,
      pageSize: 5,
    });
    expect(data.searchApplications.items.length).toBeGreaterThan(0);
    expect(data.searchApplications.totalCount).toBeGreaterThan(0);
  });

  test('submitApplication then changeStatus', async ({ request }) => {
    const client = new GraphQLClient(request, '/graphql');
    const submitted = await run(client, SUBMIT, {
      input: {
        firstName: 'Smoke',
        lastName: 'Tester',
        email: 'smoke@example.test',
        phone: '555-0100',
        isSenior: false,
        isNonProfit: false,
        permitTypeCode: 'RENO',
        siteAddress: '1 Test Street',
        areaSqM: 40,
        description: 'Smoke test application',
      },
    });
    const reference = submitted.submitApplication.referenceNumber as string;
    expect(reference).toMatch(/^PRM-/);

    const changed = await run(client, CHANGE_STATUS, {
      referenceNumber: reference,
      newStatus: 'UNDER_REVIEW',
      changedBy: 'smoke',
      note: 'picked up',
    });
    expect(changed.changeStatus.history.length).toBeGreaterThan(1);
  });

  test('introspection', async ({ request }) => {
    const data = await run(new GraphQLClient(request, '/graphql'), INTROSPECTION);
    expect(data.__schema.queryType.name).toBe('Query');
    expect(data.__schema.mutationType.name).toBe('Mutation');
  });

  test('malformed body returns 400 plain text', async ({ request }) => {
    const response = await request.post('/graphql', {
      headers: { 'content-type': 'application/json' },
      data: '{not json',
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).toBe('Invalid request');
  });
});
