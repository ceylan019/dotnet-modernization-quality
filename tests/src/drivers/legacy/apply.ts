import type { Page } from '@playwright/test';
import type { ApplyForm, ApplyPage, FeePreview } from '../types';
import { postBack, shownText } from './postback';

const NO_PREVIEW: FeePreview = { fee: '', hst: '', total: '', dueDate: '' };

export class LegacyApplyPage implements ApplyPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/Apply.aspx');
  }

  async permitTypeOptions(): Promise<string[]> {
    return this.page.locator('#MainContent_PermitType option').allInnerTexts();
  }

  async fill(f: ApplyForm): Promise<void> {
    const p = this.page;
    await p.locator('#MainContent_FirstName').fill(f.firstName);
    await p.locator('#MainContent_LastName').fill(f.lastName);
    await p.locator('#MainContent_Email').fill(f.email ?? '');
    await p.locator('#MainContent_Phone').fill(f.phone ?? '');
    await p.locator('#MainContent_IsSenior').setChecked(f.isSenior ?? false);
    await p.locator('#MainContent_IsNonProfit').setChecked(f.isNonProfit ?? false);
    await p.locator('#MainContent_PermitType').selectOption(f.permitType);
    await p.locator('#MainContent_SiteAddress').fill(f.siteAddress);
    await p.locator('#MainContent_AreaSqM').fill(f.areaSqM);
    await p.locator('#MainContent_Description').fill(f.description ?? '');
  }

  async preview(): Promise<FeePreview> {
    await postBack(this.page, this.page.locator('#MainContent_PreviewButton'));
    return this.shownPreview();
  }

  // The Submit button only exists once an estimate is shown, so submitting previews first.
  async submit(): Promise<string> {
    const submit = this.page.locator('#MainContent_SubmitButton');
    if (!(await submit.isVisible())) {
      await this.preview();
      if (!(await submit.isVisible())) return '';
    }
    await postBack(this.page, submit);
    const reference = this.page.locator('#MainContent_ReferenceNumber');
    return (await reference.isVisible()) ? reference.innerText() : '';
  }

  async validationMessages(): Promise<string[]> {
    return this.page.evaluate(() => {
      const messages: string[] = [];
      const summary = document.getElementById('MainContent_ValidationSummary');
      if (summary && summary.checkVisibility()) {
        messages.push(...Array.from(summary.querySelectorAll('li')).map((li) => li.innerText));
      }
      const error = document.getElementById('MainContent_ErrorMessage');
      if (error && error.innerText.trim() !== '') messages.push(error.innerText);
      return messages;
    });
  }

  private async shownPreview(): Promise<FeePreview> {
    const p = this.page;
    if (!(await p.locator('#MainContent_FeeAmount').isVisible())) return NO_PREVIEW;
    return {
      fee: await shownText(p.locator('#MainContent_FeeAmount')),
      hst: await shownText(p.locator('#MainContent_HstAmount')),
      total: await shownText(p.locator('#MainContent_TotalAmount')),
      dueDate: await shownText(p.locator('#MainContent_DueDate')),
    };
  }
}
