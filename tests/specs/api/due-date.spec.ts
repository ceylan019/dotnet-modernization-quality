import { DUE_DATE } from '../../src/api/operations';
import { apiTags, expectData, expectErrors, runApiCase } from '../../src/api/parity-case';
import { ACTIVE_PERMIT_TYPES, INACTIVE_PERMIT_TYPE, loadCatalog } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';

const SUITE = 'due-date';
const DUE_RISKS = ['RISK-DATE-01', 'RISK-API-03'];
const ERROR_RISKS = ['RISK-API-02'];
const { dueDateProbes, fixedToday } = loadCatalog();

for (const date of dueDateProbes) {
  for (const type of ACTIVE_PERMIT_TYPES) {
    test(`due date ${type} submitted ${date}`, { tag: apiTags(DUE_RISKS) }, async ({ gql }, testInfo) => {
      const res = await runApiCase(gql, testInfo, {
        suite: SUITE,
        caseId: `due-${type.toLowerCase()}-${date}`,
        risks: DUE_RISKS,
        query: DUE_DATE,
        variables: { permitTypeCode: type, submittedOn: date },
      });
      const data = expectData(res) as { dueDate: string };
      expect(data.dueDate > date, res.raw).toBe(true);
    });
  }
}

for (const type of [INACTIVE_PERMIT_TYPE, 'NOPE']) {
  test(`due date error ${type}`, { tag: apiTags(ERROR_RISKS) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE,
      caseId: `due-${type.toLowerCase()}-${fixedToday}`,
      risks: ERROR_RISKS,
      query: DUE_DATE,
      variables: { permitTypeCode: type, submittedOn: fixedToday },
    });
    expectErrors(res);
  });
}
