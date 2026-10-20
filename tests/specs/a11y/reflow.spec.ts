import { expect, test } from '../../src/fixtures';
import { scrollWidth } from '../../src/ui/browser';
import { recordFindings } from '../../src/ui/findings';
import { PAGE_NAMES, showPage } from '../../src/ui/pages';

const SUITE = 'a11y';
const RISKS = ['RISK-A11Y-03'];
const TAGS = ['@a11y', ...RISKS.map((r) => `@${r}`)];
const WIDTH = 375;

// WCAG 1.4.10: content reflows at 320 CSS px; 375 px is the common phone width.
test.use({ viewport: { width: WIDTH, height: 812 } });

// showPage fills the search grid, the widest content of the app.
for (const name of PAGE_NAMES) {
  test(`${name}: no horizontal scrolling at ${WIDTH} px`, { tag: TAGS }, async ({ app, page, env }, testInfo) => {
    await showPage(app, page, name);
    const width = await scrollWidth(page);
    recordFindings(testInfo, env, { suite: SUITE, caseId: `reflow-${name}`, risks: RISKS, request: { view: name, viewportWidth: WIDTH }, actual: { scrollWidth: width } });
    test.skip(env.parityMode === 'record', 'gate applies to the modern app');

    expect(width, 'document.documentElement.scrollWidth').toBeLessThanOrEqual(WIDTH);
  });
}
