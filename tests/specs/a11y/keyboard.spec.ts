import type { Page } from '@playwright/test';
import type { AppDriver } from '../../src/drivers/types';
import { expect, test } from '../../src/fixtures';
import { tabWalk } from '../../src/ui/browser';
import { tabOrderProblems } from '../../src/ui/checks';
import { pushEvidence, recordFindings } from '../../src/ui/findings';
import { PREVIEW_FORM } from '../../src/ui/pages';

const SUITE = 'a11y';
const RISKS = ['RISK-A11Y-02'];
const TAGS = ['@a11y', ...RISKS.map((r) => `@${r}`)];

// The fee preview re-renders the form (a full postback in Web Forms, an interactive update in
// Blazor) and adds the Submit button, so the order is checked again after it.
const STATES: { caseId: string; title: string; show: (app: AppDriver, page: Page) => Promise<void> }[] = [
  {
    caseId: 'keyboard-apply',
    title: 'Apply',
    show: (app) => app.apply.open(),
  },
  {
    caseId: 'keyboard-apply-after-preview',
    title: 'Apply after the fee preview',
    show: async (app) => {
      await app.apply.open();
      await app.apply.fill(PREVIEW_FORM);
      const shown = await app.apply.preview();
      expect(shown.fee, 'a valid form shows a fee estimate').not.toBe('');
    },
  },
];

for (const state of STATES) {
  test(`${state.title}: Tab reaches every field in visual order with a visible focus indicator`, { tag: TAGS }, async ({ app, page, env }, testInfo) => {
    await state.show(app, page);
    const report = await tabWalk(page);
    recordFindings(testInfo, env, { suite: SUITE, caseId: state.caseId, risks: RISKS, request: { view: state.caseId, keys: 'Tab' }, actual: report });
    test.skip(env.parityMode === 'record', 'gate applies to the modern app');

    pushEvidence(testInfo, 'fields', report.fields.length);
    expect(tabOrderProblems(report)).toEqual([]);
  });
}
