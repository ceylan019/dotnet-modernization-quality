import { expect, test } from '../../src/fixtures';
import { pushEvidence, recordFindings } from '../../src/ui/findings';
import { VIEWS } from '../../src/ui/pages';

const RISKS = ['RISK-HEALTH-01'];
const TAGS = ['@security', ...RISKS.map((r) => `@${r}`)];

test('pages log no console errors', { tag: TAGS }, async ({ app, page, env, consoleErrors }, testInfo) => {
  const errorsByView: Record<string, string[]> = {};
  for (const view of VIEWS) {
    const before = consoleErrors.length;
    await view.show(app, page);
    // Late errors (a failed script, an interactive circuit that cannot connect) arrive after load.
    await page.waitForLoadState('networkidle');
    errorsByView[view.name] = consoleErrors.slice(before).map((e) => e.replaceAll(env.baseUrl, '<base url>'));
  }

  recordFindings(testInfo, env, {
    suite: 'security', caseId: 'console', risks: RISKS, request: { views: VIEWS.map((v) => v.name) }, actual: errorsByView,
  });
  test.skip(env.parityMode === 'record', 'gate applies to the modern app');

  pushEvidence(testInfo, 'views', VIEWS.length);
  expect(Object.entries(errorsByView).filter(([, errors]) => errors.length > 0)).toEqual([]);
});
