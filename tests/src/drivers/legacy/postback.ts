import type { Locator, Page } from '@playwright/test';

interface ClientValidation {
  // .NET Framework (WebUIValidation.js): false after a cancelled submit.
  Page_IsValid?: boolean;
  // Both runtimes evaluate every validator inside the click: isvalid on .NET Framework,
  // _isvalid on Mono (the preview), which keeps no page level flag.
  Page_Validators?: ({ isvalid?: unknown; _isvalid?: unknown } | null)[];
}

// Clicks a control that posts the Web Forms page back and waits until the returned page has
// loaded. Client validation runs inside the click and can cancel the postback; it then marks
// a validator invalid and there is no load to wait for. A validation summary is no such
// signal: one shown by an earlier attempt is still visible when the click starts a postback.
export async function postBack(page: Page, control: Locator): Promise<void> {
  const loaded = page.waitForEvent('load');
  await control.click();
  const cancelled = page
    .waitForFunction(() => {
      const w = window as unknown as ClientValidation;
      if (w.Page_IsValid === false) return true;
      return Array.isArray(w.Page_Validators)
        && w.Page_Validators.some((v) => v?.isvalid === false || v?._isvalid === false);
    })
    // The check runs in the page that is being replaced; if that page goes away first, the
    // load decides.
    .then(() => undefined, () => loaded);
  await Promise.race([loaded, cancelled]);
}

// innerText is the text as rendered (CSS whitespace rules applied), which is what a user reads.
export async function shownText(locator: Locator): Promise<string> {
  if ((await locator.count()) === 0) return '';
  return locator.innerText();
}
