import { expect, test } from '@playwright/test';
import { loadCatalog } from '../src/catalog';

const catalog = loadCatalog();

const approvedReference = catalog.categories.statusApproved[0];

test.describe('legacy Web Forms UI', { tag: '@smoke' }, () => {
  test('each page loads with HTTP 200', async ({ page }) => {
    for (const path of [
      '/Default.aspx',
      '/Apply.aspx',
      `/Detail.aspx?ref=${approvedReference}`,
      `/Review.aspx?ref=${approvedReference}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
    }
  });

  test('search for tremblay shows at least one row', async ({ page }) => {
    await page.goto('/Default.aspx');
    await page.locator('#MainContent_SearchText').fill('tremblay');
    await page.locator('#MainContent_SearchButton').click();

    const rows = page.locator('#MainContent_ResultsGrid tr').filter({ has: page.locator('td') });
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(page.locator('#MainContent_ResultCount')).toContainText('applications found');
  });

  test('preview shows the fee quote and submit returns a reference', async ({ page }) => {
    await page.goto('/Apply.aspx');
    await page.locator('#MainContent_FirstName').fill('Smoke');
    await page.locator('#MainContent_LastName').fill('Tester');
    await page.locator('#MainContent_Email').fill('smoke.tester@example.test');
    await page.locator('#MainContent_PermitType').selectOption('RENO');
    await page.locator('#MainContent_SiteAddress').fill('1 Test Street');
    await page.locator('#MainContent_AreaSqM').fill('10.70');
    await page.locator('#MainContent_PreviewButton').click();

    await expect(page.locator('#MainContent_FeeAmount')).toHaveText('$175.15');
    await expect(page.locator('#MainContent_HstAmount')).toHaveText('$22.77');
    await expect(page.locator('#MainContent_TotalAmount')).toHaveText('$197.92');
    await expect(page.locator('#MainContent_DueDate')).toHaveText('2026-10-29');

    await page.locator('#MainContent_SubmitButton').click();
    await expect(page.locator('#MainContent_ReferenceNumber')).toHaveText(/^PRM-2026-\d{6}$/);
  });

  test('invalid status transition shows the business rule message', async ({ page }) => {
    await page.goto(`/Review.aspx?ref=${approvedReference}`);
    await page.locator('#MainContent_NewStatus').selectOption('UnderReview');
    await page.locator('#MainContent_ChangedBy').fill('smoke.reviewer');
    await page.locator('#MainContent_ChangeButton').click();

    await expect(page.locator('#MainContent_ErrorMessage')).toContainText(
      'Invalid status transition from Approved to UnderReview',
    );
  });
});
