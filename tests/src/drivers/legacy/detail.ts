import type { Page } from '@playwright/test';
import type { DetailPage } from '../types';

export class LegacyDetailPage implements DetailPage {
  constructor(private readonly page: Page) {}

  async open(ref: string): Promise<void> {
    await this.page.goto(`/Detail.aspx?ref=${encodeURIComponent(ref)}`);
  }

  // Each field is a div.field holding a span.label followed by the value element.
  async values(): Promise<Record<string, string>> {
    const panel = this.page.locator('#MainContent_DetailPanel');
    if ((await panel.count()) === 0) return {};
    return panel.evaluate((el) => {
      const out: Record<string, string> = {};
      for (const field of Array.from(el.querySelectorAll('.field'))) {
        const label = field.querySelector('.label') as HTMLElement | null;
        const value = label?.nextElementSibling as HTMLElement | null | undefined;
        if (label && value) out[label.innerText] = value.innerText;
      }
      return out;
    });
  }

  async history(): Promise<Record<string, string>[]> {
    const panel = this.page.locator('#MainContent_DetailPanel');
    if ((await panel.count()) === 0) return [];
    return panel.evaluate((el) => {
      const table = el.querySelector('table.grid');
      if (!table) return [];
      const rows = Array.from(table.querySelectorAll('tr'));
      const headers = Array.from(rows[0]?.querySelectorAll('th') ?? []).map((th) => th.innerText);
      return rows.slice(1).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        return Object.fromEntries(cells.map((td, i) => [headers[i] ?? `column ${i + 1}`, td.innerText]));
      });
    });
  }

  async isNotFound(): Promise<boolean> {
    return this.page.locator('#MainContent_NotFoundPanel').isVisible();
  }
}
