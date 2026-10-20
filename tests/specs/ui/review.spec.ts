import { APPLICATION, SUBMIT } from '../../src/api/operations';
import { expectData, runApiCase } from '../../src/api/parity-case';
import { category } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';
import { expectParity } from '../../src/parity/expect-parity';
import { normalizeValues } from '../../src/parity/normalize';
import { newApplicationVolatile, uiTags } from '../../src/ui/ui-case';

// Runs after every read-only spec (see playwright.config.ts). Each change made on the Review
// page is followed by `application` (with history) through the API.

const SUITE = 'ui-review';
const RISKS = ['RISK-UI-01', 'RISK-WF-01'];
const CHANGED_BY = 'ui.reviewer';
// Status options are chosen as shown.
const UNDER_REVIEW = 'Under review';

test('an invalid transition shows the business rule message', { tag: uiTags(RISKS) }, async ({ app, gql, env }, testInfo) => {
  const ref = category('statusApproved')[0]!;
  await app.review.open(ref);
  const result = await app.review.change(UNDER_REVIEW, CHANGED_BY);
  // Checks the premise of the case while recording: legacy refuses Approved to Under review.
  if (env.parityMode === 'record') expect(result.error, 'error shown').toBeTruthy();
  expectParity(testInfo, {
    suite: SUITE,
    caseId: 'approved-to-under-review',
    risks: RISKS,
    request: { page: 'review', reference: ref, newStatus: UNDER_REVIEW, changedBy: CHANGED_BY, note: null },
    actual: normalizeValues({ ...result }),
  });

  // The refused change must leave the seeded record as it was.
  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: 'approved-to-under-review-state',
    risks: RISKS,
    query: APPLICATION,
    variables: { referenceNumber: ref },
  });
  expectData(res);
});

test('a valid change on a new application shows the new status', { tag: uiTags(RISKS) }, async ({ app, gql, env }, testInfo) => {
  const submitted = await gql.send(SUBMIT, {
    input: {
      firstName: 'Noor', lastName: 'Haddad', email: 'noor.haddad@example.test', phone: null,
      isSenior: false, isNonProfit: false, permitTypeCode: 'SIGN', siteAddress: '300 King Street',
      areaSqM: 4.5, description: 'Storefront sign',
    },
  });
  const ref = (expectData(submitted) as { submitApplication: { referenceNumber: string } }).submitApplication.referenceNumber;
  const placeholder = '<new application for the Review page>';

  await app.review.open(ref);
  const result = await app.review.change(UNDER_REVIEW, CHANGED_BY, 'Picked up for review');
  if (env.parityMode === 'record') expect(result.success, 'success shown').toBeTruthy();
  expectParity(testInfo, {
    suite: SUITE,
    caseId: 'submitted-to-under-review',
    risks: RISKS,
    request: { page: 'review', reference: placeholder, newStatus: UNDER_REVIEW, changedBy: CHANGED_BY, note: 'Picked up for review' },
    actual: normalizeValues({ ...result }),
  });

  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: 'submitted-to-under-review-state',
    risks: RISKS,
    query: APPLICATION,
    variables: { referenceNumber: ref },
    recordedVariables: { referenceNumber: placeholder },
    volatile: newApplicationVolatile(),
  });
  expectData(res);
});
