import { FEE_QUOTE } from '../../src/api/operations';
import { apiTags, expectData, expectErrors, runApiCase } from '../../src/api/parity-case';
import { ACTIVE_PERMIT_TYPES, INACTIVE_PERMIT_TYPE, loadCatalog } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';

const SUITE = 'fee';
const FEE_RISKS = ['RISK-FEE-01', 'RISK-FEE-02', 'RISK-API-03'];
const ERROR_RISKS = ['RISK-API-02'];

const AREAS = ['1.00', '10.70', '99.99', '250.00', '10000.00'];
const DISCOUNTS = {
  none: { isSenior: false, isNonProfit: false },
  senior: { isSenior: true, isNonProfit: false },
  nonprofit: { isSenior: false, isNonProfit: true },
  both: { isSenior: true, isNonProfit: true },
} as const;
type Discount = keyof typeof DISCOUNTS;

interface FeeCase { type: string; area: string; discount: Discount }

function discountOf(isSenior: boolean, isNonProfit: boolean): Discount {
  if (isSenior && isNonProfit) return 'both';
  if (isSenior) return 'senior';
  return isNonProfit ? 'nonprofit' : 'none';
}

const caseId = (c: FeeCase): string => `fee-${c.type.toLowerCase()}-${c.area}-${c.discount}`;

function quoteCases(): FeeCase[] {
  const cases = new Map<string, FeeCase>();
  const add = (c: FeeCase): void => {
    cases.set(caseId(c), c);
  };
  for (const type of ACTIVE_PERMIT_TYPES) {
    for (const area of AREAS) {
      for (const discount of Object.keys(DISCOUNTS) as Discount[]) add({ type, area, discount });
    }
  }
  for (const p of loadCatalog().roundingHalfAreas) {
    add({ type: p.permitTypeCode, area: p.areaSqM, discount: discountOf(p.isSenior, p.isNonProfit) });
  }
  return [...cases.values()];
}

// Business rule errors: area outside 1 to 10000, an inactive type and an unknown type.
const ERROR_CASES: FeeCase[] = [
  { type: 'RENO', area: '0.00', discount: 'none' },
  { type: 'RENO', area: '0.99', discount: 'none' },
  { type: 'RENO', area: '10000.01', discount: 'none' },
  { type: INACTIVE_PERMIT_TYPE, area: '10.00', discount: 'none' },
  { type: 'NOPE', area: '10.00', discount: 'none' },
];

const variables = (c: FeeCase): Record<string, unknown> => ({
  permitTypeCode: c.type,
  areaSqM: Number(c.area),
  ...DISCOUNTS[c.discount],
});

for (const c of quoteCases()) {
  test(`fee quote ${c.type} ${c.area} sq m ${c.discount}`, { tag: apiTags(FEE_RISKS) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE, caseId: caseId(c), risks: FEE_RISKS, query: FEE_QUOTE, variables: variables(c),
    });
    const data = expectData(res) as { feeQuote: { feeAmount: number; hstAmount: number; totalAmount: number } };
    expect(data.feeQuote.totalAmount, res.raw).toBeCloseTo(data.feeQuote.feeAmount + data.feeQuote.hstAmount, 4);
  });
}

for (const c of ERROR_CASES) {
  test(`fee quote error ${c.type} ${c.area} sq m`, { tag: apiTags(ERROR_RISKS) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE, caseId: caseId(c), risks: ERROR_RISKS, query: FEE_QUOTE, variables: variables(c),
    });
    expectErrors(res);
  });
}
