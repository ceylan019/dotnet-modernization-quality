import { APPLICATION } from '../../src/api/operations';
import { expectData, runApiCase } from '../../src/api/parity-case';
import type { ApplyForm } from '../../src/drivers/types';
import { expect, test } from '../../src/fixtures';
import { expectParity } from '../../src/parity/expect-parity';
import { normalizeValues } from '../../src/parity/normalize';
import { PREVIEW_FORM } from '../../src/ui/pages';
import { newApplicationVolatile, uiTags } from '../../src/ui/ui-case';

// Runs after every read-only spec (see playwright.config.ts): the last test submits an
// application, observed through the API right after.

const SUITE = 'ui-apply';
const REFERENCE = /^PRM-\d{4}-\d{6}$/;

// Fee, HST, total and due date as rendered: amounts in the page culture, the due date counted
// in business days from FIXED_TODAY.
const PREVIEW_RISKS = ['RISK-UI-01', 'RISK-UI-02', 'RISK-DATE-01'];

const PREVIEWS: { slug: string; form: Partial<ApplyForm>; risks: string[] }[] = [
  // 175.145 rounds half up in T-SQL to 175.15, half to even in .NET to 175.14.
  { slug: 'reno-10.70-none', form: { permitType: 'RENO', areaSqM: '10.70' }, risks: ['RISK-FEE-01'] },
  // Senior: 88.125 rounds to 88.13 (half to even: 88.12).
  { slug: 'deck-12.50-senior', form: { permitType: 'DECK', areaSqM: '12.50', isSenior: true }, risks: ['RISK-FEE-01', 'RISK-FEE-02'] },
  // Senior and non-profit: non-profit wins, 192.50 plus HST 25.025 rounded to 25.03.
  { slug: 'reno-100.00-both', form: { permitType: 'RENO', areaSqM: '100.00', isSenior: true, isNonProfit: true }, risks: ['RISK-FEE-01', 'RISK-FEE-02'] },
  // A roundingHalfAreas probe from the catalog: 141.165 rounds to 141.17 (half to even: 141.16).
  { slug: 'sign-5.10-none', form: { permitType: 'SIGN', areaSqM: '5.10' }, risks: ['RISK-FEE-01'] },
  // The largest area, non-profit: amounts with a thousands separator ($15,605.00).
  { slug: 'patio-10000.00-nonprofit', form: { permitType: 'PATIO', areaSqM: '10000.00', isNonProfit: true }, risks: ['RISK-FEE-02'] },
];

test('permit type options', { tag: uiTags(['RISK-UI-01', 'RISK-ORDER-01']) }, async ({ app }, testInfo) => {
  await app.apply.open();
  expectParity(testInfo, {
    suite: SUITE,
    caseId: 'permit-type-options',
    risks: ['RISK-UI-01', 'RISK-ORDER-01'],
    request: { page: 'apply', read: 'permit type options' },
    actual: { options: await app.apply.permitTypeOptions() },
  });
});

for (const p of PREVIEWS) {
  const risks = [...PREVIEW_RISKS, ...p.risks];
  test(`fee preview ${p.slug}`, { tag: uiTags(risks) }, async ({ app }, testInfo) => {
    const form: ApplyForm = { ...PREVIEW_FORM, isSenior: false, isNonProfit: false, ...p.form };
    await app.apply.open();
    await app.apply.fill(form);
    const shown = await app.apply.preview();
    expectParity(testInfo, {
      suite: SUITE,
      caseId: `preview-${p.slug}`,
      risks,
      request: { page: 'apply', action: 'preview', form: { ...form } },
      actual: normalizeValues({ ...shown }),
    });
  });
}

const VALIDATION: { caseId: string; title: string; form?: ApplyForm }[] = [
  { caseId: 'validation-empty-submit', title: 'an empty submit' },
  { caseId: 'validation-area-0', title: 'area 0', form: { ...PREVIEW_FORM, areaSqM: '0' } },
];

for (const v of VALIDATION) {
  test(`validation messages for ${v.title}`, { tag: uiTags(['RISK-UI-03']) }, async ({ app }, testInfo) => {
    await app.apply.open();
    if (v.form) await app.apply.fill(v.form);
    const reference = await app.apply.submit();
    expectParity(testInfo, {
      suite: SUITE,
      caseId: v.caseId,
      risks: ['RISK-UI-03'],
      request: { page: 'apply', action: 'submit', form: v.form ? { ...v.form } : null },
      actual: { submitted: reference !== '', messages: await app.apply.validationMessages() },
    });
  });
}

// Accents, an apostrophe and both discounts typed into the form, stored through the page.
const SUBMIT_FORM: ApplyForm = {
  firstName: 'Jérôme',
  lastName: "O'Neill",
  email: 'jerome.oneill@example.test',
  phone: '819-555-0142',
  isSenior: true,
  isNonProfit: false,
  permitType: 'PATIO',
  siteAddress: '27 Chemin du Lac',
  areaSqM: '25.50',
  description: 'Backyard patio with three steps',
};

test('submit a new application', { tag: uiTags(['RISK-UI-01', 'RISK-REF-01', 'RISK-FEE-02']) }, async ({ app, gql }, testInfo) => {
  const risks = ['RISK-UI-01', 'RISK-REF-01', 'RISK-FEE-02'];
  await app.apply.open();
  await app.apply.fill(SUBMIT_FORM);
  const reference = await app.apply.submit();
  expect(reference, 'reference shown after submitting').toMatch(REFERENCE);

  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: 'submit-state',
    risks,
    query: APPLICATION,
    variables: { referenceNumber: reference },
    recordedVariables: { referenceNumber: '<new application from the Apply page>' },
    volatile: newApplicationVolatile(),
  });
  expectData(res);
});
