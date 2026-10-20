import { APPLICATION } from '../../src/api/operations';
import { expectData } from '../../src/api/parity-case';
import { category } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';
import { markupFacts } from '../../src/ui/browser';
import { markupProblems, type MarkupFacts } from '../../src/ui/checks';
import { pushEvidence, recordFindings } from '../../src/ui/findings';

const RISKS = ['RISK-SEC-01'];
const TAGS = ['@security', ...RISKS.map((r) => `@${r}`)];

interface Applicant { application: { applicant: { firstName: string; lastName: string } } | null }

// The htmlInNames records hold `<b>Roy</b>`, `<script>alert('x')</script>`, `Smith & Sons` and
// `"><img src=x>` as last names. Each must show as typed, on the detail page and in search
// results, without creating an element or opening a dialog.
test('names containing markup render as literal text', { tag: TAGS }, async ({ app, page, gql, env }, testInfo) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  const refs = category('htmlInNames');
  const findings: ({ reference: string; view: string } & MarkupFacts)[] = [];
  for (const ref of refs) {
    const res = await gql.send(APPLICATION, { referenceNumber: ref });
    const applicant = (expectData(res) as unknown as Applicant).application?.applicant;
    if (!applicant) throw new Error(`${ref} not found: ${res.raw}`);
    const literals = [applicant.firstName, applicant.lastName];

    for (const view of ['detail', 'search']) {
      dialogs.length = 0;
      if (view === 'detail') {
        await app.detail.open(ref);
      } else {
        await app.search.open();
        await app.search.search(ref);
      }
      findings.push({ reference: ref, view, ...(await markupFacts(page, literals)), dialogs: [...dialogs] });
    }
  }

  recordFindings(testInfo, env, {
    suite: 'security', caseId: 'encoding', risks: RISKS, request: { references: refs, views: ['detail', 'search'] }, actual: findings,
  });
  test.skip(env.parityMode === 'record', 'gate applies to the modern app');

  pushEvidence(testInfo, 'records', refs.length);
  const problems = findings.flatMap((f) => markupProblems(f).map((p) => `${f.reference} ${f.view}: ${p}`));
  expect(problems).toEqual([]);
});
