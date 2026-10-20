import type { Page } from '@playwright/test';
import type { AppDriver, ApplyForm } from '../drivers/types';

// The pages every driver offers in AppDriver.pages, in this order. Baseline case IDs use these
// names, so both drivers must use them.
export const PAGE_NAMES = ['search', 'apply', 'detail', 'review'] as const;
export type PageName = (typeof PAGE_NAMES)[number];

// Fails when the driver's pages differ from PAGE_NAMES, so a page added to a driver cannot go
// unchecked by the page level gates.
export function pagePath(app: AppDriver, name: PageName): string {
  const names = app.pages.map((p) => p.name);
  if (names.join('\n') !== PAGE_NAMES.join('\n')) {
    throw new Error(`The driver pages (${names.join(', ')}) differ from the pages the checks cover (${PAGE_NAMES.join(', ')})`);
  }
  return app.pages.find((p) => p.name === name)!.path;
}

// A complete, valid form. Previewing it changes nothing.
export const PREVIEW_FORM: ApplyForm = {
  firstName: 'Avery',
  lastName: 'Lindqvist',
  email: 'avery.lindqvist@example.test',
  permitType: 'RENO',
  siteAddress: '1 Test Street',
  areaSqM: '10.70',
};

// Every ApplyForm field. A form shows at least this many controls, so the keyboard check can
// tell an empty walk (controls it cannot see, such as inputs inside shadow roots) from a pass.
export const APPLY_FORM_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'isSenior', 'isNonProfit', 'permitType', 'siteAddress', 'areaSqM', 'description',
] as const;
type UnlistedField = Exclude<keyof ApplyForm, (typeof APPLY_FORM_FIELDS)[number]>;
// Does not compile when ApplyForm gains a field the list above does not name.
export const APPLY_FORM_FIELDS_COMPLETE: [UnlistedField] extends [never] ? true : never = true;

// Opens a page as the page-level checks see it. Search runs an empty search first, so the
// results grid is full (20 rows and the pager) in both apps.
export async function showPage(app: AppDriver, page: Page, name: PageName): Promise<void> {
  const response = await page.goto(pagePath(app, name));
  if (!response?.ok()) throw new Error(`Page ${name} answered HTTP ${response?.status() ?? 'without a response'}`);
  if (name === 'search') await app.search.search('');
}

export interface View {
  name: string;
  show(app: AppDriver, page: Page): Promise<void>;
}

// Every page, plus the Apply page in the two states a user reaches without submitting:
// with a fee estimate, and with validation messages (an empty form previewed).
export const VIEWS: View[] = [
  ...PAGE_NAMES.map((name) => ({ name, show: (app: AppDriver, page: Page) => showPage(app, page, name) })),
  {
    name: 'apply-preview',
    show: async (app) => {
      await app.apply.open();
      await app.apply.fill(PREVIEW_FORM);
      const shown = await app.apply.preview();
      if (shown.fee === '') throw new Error('The Apply page showed no fee estimate for a valid form');
    },
  },
  {
    name: 'apply-errors',
    show: async (app) => {
      await app.apply.open();
      await app.apply.preview();
      if ((await app.apply.validationMessages()).length === 0) {
        throw new Error('The Apply page showed no validation messages for an empty form');
      }
    },
  },
];
