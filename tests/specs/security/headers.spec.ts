import { expect, test } from '../../src/fixtures';
import { headerFindings, headerProblems, type HeaderFindings } from '../../src/ui/checks';
import { pushEvidence, recordFindings } from '../../src/ui/findings';
import { PAGE_NAMES, pagePath } from '../../src/ui/pages';

const RISKS = ['RISK-SEC-03'];
const TAGS = ['@security', ...RISKS.map((r) => `@${r}`)];

test('every page sends the security headers and no version headers', { tag: TAGS }, async ({ app, request, env }, testInfo) => {
  const findings: Record<string, HeaderFindings> = {};
  for (const name of PAGE_NAMES) {
    const response = await request.get(pagePath(app, name));
    expect(response.status(), `${name} answers`).toBe(200);
    findings[name] = headerFindings(response.headers());
  }

  recordFindings(testInfo, env, {
    suite: 'security', caseId: 'headers', risks: RISKS, request: { pages: [...PAGE_NAMES] }, actual: findings,
  });
  test.skip(env.parityMode === 'record', 'gate applies to the modern app');

  pushEvidence(testInfo, 'pages', PAGE_NAMES.length);
  const problems = Object.entries(findings).flatMap(([name, f]) => headerProblems(f).map((p) => `${name}: ${p}`));
  expect(problems).toEqual([]);
});
