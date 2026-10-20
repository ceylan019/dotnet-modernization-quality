import type { Page } from '@playwright/test';
import type { ReviewPage } from '../types';
import { postBack, shownText } from './postback';

export class LegacyReviewPage implements ReviewPage {
  constructor(private readonly page: Page) {}

  async open(ref: string): Promise<void> {
    await this.page.goto(`/Review.aspx?ref=${encodeURIComponent(ref)}`);
  }

  async change(newStatus: string, changedBy: string, note?: string): Promise<{ error?: string; success?: string }> {
    const p = this.page;
    await p.locator('#MainContent_NewStatus').selectOption(newStatus);
    await p.locator('#MainContent_ChangedBy').fill(changedBy);
    await p.locator('#MainContent_Note').fill(note ?? '');
    await postBack(p, p.locator('#MainContent_ChangeButton'));

    const error = await shownText(p.locator('#MainContent_ErrorMessage'));
    const success = await shownText(p.locator('#MainContent_SuccessMessage'));
    return {
      ...(error.trim() !== '' ? { error } : {}),
      ...(success.trim() !== '' ? { success } : {}),
    };
  }
}
