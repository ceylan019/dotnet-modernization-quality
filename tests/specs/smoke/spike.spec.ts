import { expect, test } from '@playwright/test';

test('legacy home page lists permit types', { tag: '@smoke' }, async ({ page }) => {
  const response = await page.goto('/Default.aspx');
  expect(response?.status()).toBe(200);

  const dataRows = page.locator('#MainContent_PermitTypesGrid tr').filter({ has: page.locator('td') });
  await expect(dataRows).toHaveCount(6);
});

test('legacy GraphQL returns permit types', { tag: '@smoke' }, async ({ request }) => {
  const response = await request.post('/graphql', {
    data: { query: '{ permitTypes { code name } }' },
  });
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { data: { permitTypes: { code: string; name: string }[] } };
  expect(body.data.permitTypes).toHaveLength(6);
});
