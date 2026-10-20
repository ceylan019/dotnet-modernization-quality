import { category } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';
import { expectParity } from '../../src/parity/expect-parity';
import { normalizeValues } from '../../src/parity/normalize';
import { uiTags } from '../../src/ui/ui-case';

const SUITE = 'ui-detail';
const NOT_FOUND = 'PRM-2099-999999';

// Every detail page shows money and dates as rendered (RISK-UI-02).
const SHOWN = ['RISK-UI-01', 'RISK-UI-02'];

// One record of each catalog category whose hazard shows on the detail page. The htmlInNames
// records belong to specs/security/encoding.spec.ts: their legacy rendering is the flaw.
const CATEGORIES: { name: string; risks: string[] }[] = [
  { name: 'accentedNames', risks: ['RISK-SEARCH-03'] },
  { name: 'varcharAddressAccents', risks: ['RISK-SEARCH-03'] },
  { name: 'nullContact', risks: [] },
  { name: 'emptyVsNullDescription', risks: [] },
  { name: 'emojiDescription', risks: [] },
  { name: 'roundingHalfFee', risks: ['RISK-FEE-01'] },
  { name: 'unroundedMoney', risks: ['RISK-FEE-02'] },
  { name: 'holidayAdjacentDueDate', risks: ['RISK-DATE-01'] },
  { name: 'expiryBoundary', risks: ['RISK-DATE-03'] },
  { name: 'multiStepHistory', risks: ['RISK-ORDER-01'] },
];

for (const c of CATEGORIES) {
  const ref = category(c.name)[0]!;
  const risks = [...SHOWN, ...c.risks];
  test(`detail of ${ref} (${c.name})`, { tag: uiTags(risks) }, async ({ app, env }, testInfo) => {
    await app.detail.open(ref);
    const values = await app.detail.values();
    // Checks the premise of the case against the seed while recording.
    if (env.parityMode === 'record') expect(Object.keys(values).length, 'values shown').toBeGreaterThan(0);
    expectParity(testInfo, {
      suite: SUITE,
      caseId: `detail-${ref.toLowerCase()}`,
      risks,
      request: { page: 'detail', reference: ref },
      actual: {
        notFound: await app.detail.isNotFound(),
        values: normalizeValues(values),
        history: (await app.detail.history()).map(normalizeValues),
      },
    });
  });
}

test(`detail of ${NOT_FOUND} that does not exist`, { tag: uiTags(['RISK-UI-01']) }, async ({ app }, testInfo) => {
  await app.detail.open(NOT_FOUND);
  expectParity(testInfo, {
    suite: SUITE,
    caseId: `detail-${NOT_FOUND.toLowerCase()}-not-found`,
    risks: ['RISK-UI-01'],
    request: { page: 'detail', reference: NOT_FOUND },
    actual: {
      notFound: await app.detail.isNotFound(),
      values: normalizeValues(await app.detail.values()),
      history: (await app.detail.history()).map(normalizeValues),
    },
  });
});
