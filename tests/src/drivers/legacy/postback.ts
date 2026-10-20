import type { Locator, Page } from '@playwright/test';

// Clicks a control that posts the Web Forms page back and waits until the returned page has
// loaded. ASP.NET client validation can cancel the postback; then the validation summary shows
// on the same page and there is no load to wait for.
export async function postBack(page: Page, control: Locator): Promise<void> {
  const loaded = page.waitForEvent('load').then(() => 'loaded' as const);
  await control.click();
  const blocked = page
    .locator('#MainContent_ValidationSummary li')
    .first()
    .waitFor({ state: 'visible' })
    .then(() => 'blocked' as const);
  await Promise.race([loaded, blocked]);
}

// innerText is the text as rendered (CSS whitespace rules applied), which is what a user reads.
export async function shownText(locator: Locator): Promise<string> {
  if ((await locator.count()) === 0) return '';
  return locator.innerText();
}
