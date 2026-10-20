import { APPLICATION } from '../../src/api/operations';
import { apiTags, expectData, recording, runApiCase } from '../../src/api/parity-case';
import { category, loadCatalog } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';

const SUITE = 'application';
const NOT_FOUND = 'PRM-2099-999999';

// Risks a category's records probe beyond scalar serialization (RISK-API-03, on every case).
const CATEGORY_RISKS: Record<string, string[]> = {
  accentedNames: ['RISK-SEARCH-03'],
  varcharAddressAccents: ['RISK-SEARCH-03'],
  trailingSpaceNames: ['RISK-SEARCH-02'],
  roundingHalfFee: ['RISK-FEE-02'],
  unroundedMoney: ['RISK-FEE-02'],
  expiryBoundary: ['RISK-DATE-03'],
  multiStepHistory: ['RISK-ORDER-01'],
};

// Every catalog reference once, with the risks of all categories it belongs to.
function catalogReferences(): Map<string, string[]> {
  const refs = new Map<string, Set<string>>();
  for (const [name, list] of Object.entries(loadCatalog().categories)) {
    for (const ref of list) {
      const risks = refs.get(ref) ?? new Set(['RISK-API-03']);
      for (const r of CATEGORY_RISKS[name] ?? []) risks.add(r);
      refs.set(ref, risks);
    }
  }
  return new Map([...refs].sort(([a], [b]) => a.localeCompare(b)).map(([ref, risks]) => [ref, [...risks].sort()]));
}

interface Found { application: { referenceNumber: string } | null }

for (const [ref, risks] of catalogReferences()) {
  test(`application ${ref}`, { tag: apiTags(risks) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE, caseId: `app-${ref.toLowerCase()}`, risks, query: APPLICATION, variables: { referenceNumber: ref },
    });
    const data = expectData(res) as unknown as Found;
    expect(data.application?.referenceNumber, res.raw).toBe(ref);
  });
}

// SQL Server `=` ignores trailing spaces, so legacy finds these.
for (const ref of category('trailingSpaceNames')) {
  const risks = ['RISK-SEARCH-02', 'RISK-API-03'];
  test(`application ${ref} with a trailing space`, { tag: apiTags(risks) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE,
      caseId: `app-${ref.toLowerCase()}-trailing-space`,
      risks,
      query: APPLICATION,
      variables: { referenceNumber: `${ref} ` },
    });
    expectData(res);
  });
}

test(`application ${NOT_FOUND} that does not exist`, { tag: apiTags(['RISK-API-02']) }, async ({ gql }, testInfo) => {
  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: `app-${NOT_FOUND.toLowerCase()}-not-found`,
    risks: ['RISK-API-02'],
    query: APPLICATION,
    variables: { referenceNumber: NOT_FOUND },
  });
  // Legacy answers null without an error; the modern app may answer differently (parity decides).
  if (recording()) expect((expectData(res) as unknown as Found).application, res.raw).toBeNull();
});
