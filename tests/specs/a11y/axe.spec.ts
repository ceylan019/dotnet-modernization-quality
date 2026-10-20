import { expect, test } from '../../src/fixtures';
import { axeScan, WCAG_TAGS } from '../../src/ui/browser';
import { seriousOrCritical, type AxeViolation } from '../../src/ui/checks';
import { legacyFindings, pushEvidence, recordFindings } from '../../src/ui/findings';
import { VIEWS } from '../../src/ui/pages';

const SUITE = 'a11y';
const RISKS = ['RISK-A11Y-01'];
const TAGS = ['@a11y', ...RISKS.map((r) => `@${r}`)];

// The count compared with legacy is the number of violated axe rules on the page (any impact).
for (const view of VIEWS) {
  test(`${view.name}: no serious or critical axe violations, no more violated rules than legacy`, { tag: TAGS }, async ({ app, page, env }, testInfo) => {
    await view.show(app, page);
    const { violations, rulesRun } = await axeScan(page);
    const request = { view: view.name, tags: WCAG_TAGS };
    recordFindings(testInfo, env, { suite: SUITE, caseId: view.name, risks: RISKS, request, actual: { violations } });
    test.skip(env.parityMode === 'record', 'gate applies to the modern app');

    pushEvidence(testInfo, 'axe-rules', rulesRun);
    const legacy = legacyFindings(SUITE, view.name, request) as unknown as { violations: AxeViolation[] };
    expect.soft(seriousOrCritical(violations), 'serious or critical violations').toEqual([]);
    expect.soft(
      violations.length,
      `violated rules (${violations.map((v) => v.id).join(', ')}), legacy had ${legacy.violations.length} (${legacy.violations.map((v) => v.id).join(', ')})`,
    ).toBeLessThanOrEqual(legacy.violations.length);
  });
}
