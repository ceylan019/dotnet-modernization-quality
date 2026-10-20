import { PERMIT_TYPES } from '../../src/api/operations';
import { apiTags, expectData, recording, runApiCase } from '../../src/api/parity-case';
import { ACTIVE_PERMIT_TYPES } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';

const RISKS = ['RISK-ORDER-01', 'RISK-API-03'];

// Legacy lists permit types without ORDER BY; the order it happens to return is the contract.
test('permit types', { tag: apiTags(RISKS) }, async ({ gql }, testInfo) => {
  const res = await runApiCase(gql, testInfo, {
    suite: 'permit-types', caseId: 'permit-types', risks: RISKS, query: PERMIT_TYPES,
  });
  const data = expectData(res) as { permitTypes: { code: string }[] | null };
  expect(data.permitTypes?.length, res.raw).toBeGreaterThan(0);
  if (recording()) expect(data.permitTypes?.map((t) => t.code), res.raw).toEqual([...ACTIVE_PERMIT_TYPES]);
});
