import type { Page } from '@playwright/test';
import type { SearchPage, SearchRow } from '../types';
import { postBack, shownText } from './postback';

const COLUMNS: Record<string, keyof SearchRow> = {
  Reference: 'reference',
  Applicant: 'applicant',
  'Permit type': 'permitType',
  Status: 'status',
  Submitted: 'submitted',
  Due: 'due',
  Total: 'total',
};

export class LegacySearchPage implements SearchPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/Default.aspx');
  }

  async search(text: string, status?: string): Promise<void> {
    await this.page.locator('#MainContent_SearchText').fill(text);
    const filter = this.page.locator('#MainContent_StatusFilter');
    await (status === undefined ? filter.selectOption({ value: '' }) : filter.selectOption(status));
    await postBack(this.page, this.page.locator('#MainContent_SearchButton'));
  }

  async rows(): Promise<SearchRow[]> {
    const grid = this.page.locator('#MainContent_ResultsGrid');
    if ((await grid.count()) === 0) return [];
    // The GridView renders a header row of th cells, the data rows, then a pager row that
    // holds a nested table of page links.
    const table = await grid.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll(':scope > tbody > tr'));
      const headers = Array.from(rows[0]?.querySelectorAll(':scope > th') ?? []).map((th) => (th as HTMLElement).innerText);
      const data = rows
        .filter((tr) => tr.querySelector(':scope > td') !== null && tr.querySelector('table') === null)
        .map((tr) => Array.from(tr.querySelectorAll(':scope > td')).map((td) => (td as HTMLElement).innerText));
      return { headers, data };
    });
    const keys = table.headers.map((h) => {
      const key = COLUMNS[h];
      if (!key) throw new Error(`Unexpected search results column "${h}"`);
      return key;
    });
    return table.data.map((cells) => {
      if (cells.length !== keys.length) throw new Error(`Search row has ${cells.length} cells, expected ${keys.length}`);
      return Object.fromEntries(keys.map((k, i) => [k, cells[i]!])) as unknown as SearchRow;
    });
  }

  async countText(): Promise<string> {
    return shownText(this.page.locator('#MainContent_ResultCount'));
  }

  async statusOptions(): Promise<string[]> {
    return this.page.locator('#MainContent_StatusFilter option').allInnerTexts();
  }

  async goToPage(n: number): Promise<void> {
    const pager = this.page.locator('#MainContent_ResultsGrid > tbody > tr > td > table');
    const label = String(n);
    if ((await pager.count()) === 0) {
      if (n === 1) return;
      throw new Error(`Results page ${n} is not offered: the grid has no pager`);
    }
    if ((await pager.locator('span').filter({ hasText: new RegExp(`^${label}$`) }).count()) > 0) return;
    const link = pager.getByRole('link', { name: label, exact: true });
    if ((await link.count()) === 0) throw new Error(`Results page ${n} is not offered by the pager`);
    await postBack(this.page, link);
  }
}
