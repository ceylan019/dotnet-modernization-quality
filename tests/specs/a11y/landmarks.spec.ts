import { expect, test } from '../../src/fixtures';
import { linkFacts } from '../../src/ui/browser';
import { ambiguousLinks } from '../../src/ui/checks';
import { pushEvidence, recordFindings } from '../../src/ui/findings';
import { PAGE_NAMES, showPage } from '../../src/ui/pages';

const SUITE = 'a11y';
const RISKS = ['RISK-A11Y-04'];
const TAGS = ['@a11y', ...RISKS.map((r) => `@${r}`)];

for (const name of PAGE_NAMES) {
  test(`${name}: one main landmark, and links that share a name share a target`, { tag: TAGS }, async ({ app, page, env }, testInfo) => {
    await showPage(app, page, name);
    const mainLandmarks = await page.getByRole('main').count();
    const links = await linkFacts(page);
    const ambiguous = ambiguousLinks(links);
    recordFindings(testInfo, env, {
      suite: SUITE, caseId: `landmarks-${name}`, risks: RISKS, request: { view: name }, actual: { mainLandmarks, ambiguousLinks: ambiguous },
    });
    test.skip(env.parityMode === 'record', 'gate applies to the modern app');

    pushEvidence(testInfo, 'links', links.length);
    expect.soft(mainLandmarks, 'main landmarks').toBe(1);
    expect.soft(ambiguous, 'link names shared by different targets').toEqual([]);
  });
}
