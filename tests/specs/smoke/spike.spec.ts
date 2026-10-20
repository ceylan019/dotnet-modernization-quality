import { expect, test } from '@playwright/test';

test('legacy GraphQL returns permit types', { tag: '@smoke' }, async ({ request }) => {
  const response = await request.post('/graphql', {
    data: { query: '{ permitTypes { code name } }' },
  });
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { data: { permitTypes: { code: string; name: string }[] } };
  expect(body.data.permitTypes).toHaveLength(6);
});
