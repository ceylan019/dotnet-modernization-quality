import type { TestInfo } from '@playwright/test';
import type { GraphQLClient } from '../../src/api/graphql-client';
import { APPLICATION, CHANGE_STATUS, SUBMIT } from '../../src/api/operations';
import { apiTags, expectData, expectErrors, recording, runApiCase } from '../../src/api/parity-case';
import { category, INACTIVE_PERMIT_TYPE } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';
import type { VolatileKind } from '../../src/parity/normalize';

// Runs after every read-only spec (see playwright.config.ts), so the records it creates never
// show up in search or page baselines. Each new application is observed through `application`
// (with history) right after every mutation, valid or rejected.

const SUITE = 'workflow';
const RULE_RISKS = ['RISK-WF-01', 'RISK-REF-01', 'RISK-FEE-01', 'RISK-FEE-02', 'RISK-ORDER-01', 'RISK-API-02', 'RISK-API-03'];
const NOT_FOUND = 'PRM-2099-999999';

interface ApplicationInput {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isSenior: boolean;
  isNonProfit: boolean;
  permitTypeCode: string;
  siteAddress: string;
  areaSqM: number;
  description: string | null;
}

// Fee 175.145 rounds to 175.15 in T-SQL (RENO 10.70, no discount).
const INPUT_A: ApplicationInput = {
  firstName: 'Amélie', lastName: 'Ouellet', email: 'amelie.ouellet@example.test', phone: '416-555-0101',
  isSenior: false, isNonProfit: false, permitTypeCode: 'RENO', siteAddress: '12 Rue Principale',
  areaSqM: 10.7, description: 'Kitchen and bathroom renovation',
};
// Senior: (95 + 1.80 x 12.50) x 0.75 = 88.125, rounds to 88.13. No contact details.
const INPUT_B: ApplicationInput = {
  firstName: 'Gordon', lastName: 'MacLeod', email: null, phone: null,
  isSenior: true, isNonProfit: false, permitTypeCode: 'DECK', siteAddress: '48 Harbour Lane',
  areaSqM: 12.5, description: null,
};
// Senior and non-profit: non-profit wins, 192.50 plus HST 25.025 rounded to 25.03. Empty description.
const INPUT_C: ApplicationInput = {
  firstName: 'Priya', lastName: 'Natarajan', email: 'garden@example.test', phone: '613-555-0199',
  isSenior: true, isNonProfit: true, permitTypeCode: 'RENO', siteAddress: '5 Riverside Drive',
  areaSqM: 100, description: '',
};

function newRecord(root: string): Record<string, VolatileKind> {
  return {
    [`${root}.referenceNumber`]: 'referenceNumber',
    [`${root}.submittedAt`]: 'timestamp',
    [`${root}.lastUpdatedAt`]: 'timestamp',
    [`${root}.history[*].changedAt`]: 'timestamp',
  };
}

// The legacy wording of a refused transition. Status names are the stored values.
const invalid = (from: string, to: string): string => `Invalid status transition from ${from} to ${to}`;

// Exact legacy wording is checked only while recording (see recording()); in compare mode
// parity owns it, so an approved difference can accept a new wording.
function expectMessage(messages: string[], expected: string, raw: string): void {
  if (recording()) expect(messages.join('\n'), raw).toContain(expected);
}

// One new application taken through a sequence of status changes. Case IDs are
// <label>-<step>, and <label>-<step>-state for the application read after the step.
class Flow {
  private ref = '';

  constructor(
    private readonly gql: GraphQLClient,
    private readonly testInfo: TestInfo,
    private readonly label: string,
    private readonly risks: string[],
  ) {}

  private get placeholder(): string {
    return `<new application ${this.label}>`;
  }

  async submit(input: ApplicationInput): Promise<void> {
    const res = await runApiCase(this.gql, this.testInfo, {
      suite: SUITE,
      caseId: `${this.label}-submit`,
      risks: this.risks,
      query: SUBMIT,
      variables: { input },
      volatile: { 'submitApplication.referenceNumber': 'referenceNumber' },
    });
    const data = expectData(res) as { submitApplication: { referenceNumber: string } };
    this.ref = data.submitApplication.referenceNumber;
    expect(this.ref, res.raw).toMatch(/^PRM-\d{4}-\d{6}$/);
    await this.state('submit');
  }

  async change(step: string, newStatus: string, note: string | null, changedBy = 'r.singh'): Promise<void> {
    const res = await this.send(step, newStatus, note, changedBy);
    const data = expectData(res) as { changeStatus: { status: string } };
    expect(data.changeStatus.status, res.raw).toBe(newStatus);
    await this.state(step);
  }

  async refuse(step: string, newStatus: string, note: string | null, message: string): Promise<void> {
    const res = await this.send(step, newStatus, note, 'r.singh');
    expectMessage(expectErrors(res), message, res.raw);
    await this.state(step);
  }

  private async send(step: string, newStatus: string, note: string | null, changedBy: string) {
    return runApiCase(this.gql, this.testInfo, {
      suite: SUITE,
      caseId: `${this.label}-${step}`,
      risks: this.risks,
      query: CHANGE_STATUS,
      variables: { referenceNumber: this.ref, newStatus, changedBy, note },
      recordedVariables: { referenceNumber: this.placeholder, newStatus, changedBy, note },
      volatile: newRecord('changeStatus'),
    });
  }

  private async state(step: string): Promise<void> {
    const res = await runApiCase(this.gql, this.testInfo, {
      suite: SUITE,
      caseId: `${this.label}-${step}-state`,
      risks: this.risks,
      query: APPLICATION,
      variables: { referenceNumber: this.ref },
      recordedVariables: { referenceNumber: this.placeholder },
      volatile: newRecord('application'),
    });
    const data = expectData(res) as { application: { history: unknown[] | null } | null };
    expect(data.application?.history?.length, res.raw).toBeGreaterThan(0);
  }
}

// usp_ChangeStatus allows five of the thirty (current, new) pairs. The three flows below take
// the valid ones and are refused each of the other twenty five.

test('application A goes through every status to approved, then every change is refused', { tag: apiTags(RULE_RISKS) }, async ({ gql }, testInfo) => {
  const a = new Flow(gql, testInfo, 'a', RULE_RISKS);
  await a.submit(INPUT_A);
  await a.change('to-under-review', 'UNDER_REVIEW', null);
  await a.change('to-info-requested', 'INFO_REQUESTED', 'Site plan required', 'm.cote');
  await a.change('back-to-under-review', 'UNDER_REVIEW', null);
  await a.change('to-approved', 'APPROVED', 'Meets the zoning bylaw', 'a.murphy');
  await a.refuse('approved-to-under-review', 'UNDER_REVIEW', null, invalid('Approved', 'UnderReview'));
  await a.refuse('approved-to-submitted', 'SUBMITTED', null, invalid('Approved', 'Submitted'));
  await a.refuse('approved-to-info-requested', 'INFO_REQUESTED', 'Need the final survey', invalid('Approved', 'InfoRequested'));
  await a.refuse('approved-to-approved', 'APPROVED', null, invalid('Approved', 'Approved'));
  await a.refuse('approved-to-rejected', 'REJECTED', 'Approved in error', invalid('Approved', 'Rejected'));
  await a.refuse('approved-to-expired', 'EXPIRED', null, invalid('Approved', 'Expired'));
});

test('application B is refused every invalid change, then rejected', { tag: apiTags(RULE_RISKS) }, async ({ gql }, testInfo) => {
  const b = new Flow(gql, testInfo, 'b', RULE_RISKS);
  await b.submit(INPUT_B);
  await b.refuse('submitted-to-approved', 'APPROVED', 'Looks fine', invalid('Submitted', 'Approved'));
  // The transition is checked before the note.
  await b.refuse('submitted-to-rejected-without-note', 'REJECTED', null, invalid('Submitted', 'Rejected'));
  await b.refuse('submitted-to-info-requested', 'INFO_REQUESTED', 'Need a survey', invalid('Submitted', 'InfoRequested'));
  await b.refuse('submitted-to-submitted', 'SUBMITTED', null, invalid('Submitted', 'Submitted'));
  await b.refuse('submitted-to-expired', 'EXPIRED', null, invalid('Submitted', 'Expired'));
  await b.change('to-under-review', 'UNDER_REVIEW', null);
  await b.refuse('rejected-null-note', 'REJECTED', null, 'A note is required when status is Rejected');
  await b.refuse('rejected-blank-note', 'REJECTED', '', 'A note is required when status is Rejected');
  await b.refuse('rejected-whitespace-note', 'REJECTED', '   ', 'A note is required when status is Rejected');
  await b.refuse('info-requested-null-note', 'INFO_REQUESTED', null, 'A note is required when status is InfoRequested');
  await b.refuse('info-requested-whitespace-note', 'INFO_REQUESTED', '  ', 'A note is required when status is InfoRequested');
  await b.refuse('under-review-to-submitted', 'SUBMITTED', null, invalid('UnderReview', 'Submitted'));
  await b.refuse('under-review-to-under-review', 'UNDER_REVIEW', null, invalid('UnderReview', 'UnderReview'));
  await b.refuse('under-review-to-expired', 'EXPIRED', null, invalid('UnderReview', 'Expired'));
  await b.change('to-rejected', 'REJECTED', 'Outside the permitted zone', 'a.murphy');
  await b.refuse('rejected-to-under-review', 'UNDER_REVIEW', null, invalid('Rejected', 'UnderReview'));
  await b.refuse('rejected-to-submitted', 'SUBMITTED', null, invalid('Rejected', 'Submitted'));
  await b.refuse('rejected-to-info-requested', 'INFO_REQUESTED', 'Resubmit the plan', invalid('Rejected', 'InfoRequested'));
  await b.refuse('rejected-to-approved', 'APPROVED', null, invalid('Rejected', 'Approved'));
  await b.refuse('rejected-to-rejected', 'REJECTED', 'Still outside the zone', invalid('Rejected', 'Rejected'));
  await b.refuse('rejected-to-expired', 'EXPIRED', null, invalid('Rejected', 'Expired'));
});

test('application C loops through info requested', { tag: apiTags(RULE_RISKS) }, async ({ gql }, testInfo) => {
  const c = new Flow(gql, testInfo, 'c', RULE_RISKS);
  await c.submit(INPUT_C);
  await c.change('to-under-review', 'UNDER_REVIEW', null);
  await c.change('to-info-requested', 'INFO_REQUESTED', 'Structural drawing required', 'm.cote');
  await c.refuse('info-requested-to-approved', 'APPROVED', null, invalid('InfoRequested', 'Approved'));
  await c.refuse('info-requested-to-rejected', 'REJECTED', 'No reply', invalid('InfoRequested', 'Rejected'));
  await c.refuse('info-requested-to-submitted', 'SUBMITTED', null, invalid('InfoRequested', 'Submitted'));
  await c.refuse('info-requested-to-info-requested', 'INFO_REQUESTED', 'Still missing', invalid('InfoRequested', 'InfoRequested'));
  await c.refuse('info-requested-to-expired', 'EXPIRED', null, invalid('InfoRequested', 'Expired'));
  await c.change('back-to-under-review', 'UNDER_REVIEW', null);
  // LTRIM and RTRIM remove spaces only, so legacy accepts a note that is a single tab.
  await c.change('to-info-requested-tab-note', 'INFO_REQUESTED', '\t', 'm.cote');
});

test('changing an application that does not exist', { tag: apiTags(['RISK-WF-01', 'RISK-API-02']) }, async ({ gql }, testInfo) => {
  const risks = ['RISK-WF-01', 'RISK-API-02'];
  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: 'not-found',
    risks,
    query: CHANGE_STATUS,
    variables: { referenceNumber: NOT_FOUND, newStatus: 'UNDER_REVIEW', changedBy: 'r.singh', note: null },
  });
  expectMessage(expectErrors(res), `Application ${NOT_FOUND} not found`, res.raw);
});

// The first expiry boundary record is past the 180 day limit. Expiry is checked before the
// transition rules, so even a transition that is otherwise allowed is refused.
test('changing an expired application', { tag: apiTags(['RISK-DATE-03', 'RISK-WF-01', 'RISK-API-02']) }, async ({ gql }, testInfo) => {
  const risks = ['RISK-DATE-03', 'RISK-WF-01', 'RISK-API-02'];
  const ref = category('expiryBoundary')[0]!;
  for (const [step, newStatus] of [['expired-to-under-review', 'UNDER_REVIEW'], ['expired-to-approved', 'APPROVED']] as const) {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE,
      caseId: step,
      risks,
      query: CHANGE_STATUS,
      variables: { referenceNumber: ref, newStatus, changedBy: 'r.singh', note: 'Reopened' },
    });
    expectMessage(expectErrors(res), `Application ${ref} has expired`, res.raw);

    const state = await runApiCase(gql, testInfo, {
      suite: SUITE, caseId: `${step}-state`, risks, query: APPLICATION, variables: { referenceNumber: ref },
    });
    const data = expectData(state) as { application: { status: string } | null };
    expect(data.application, state.raw).not.toBeNull();
    if (recording()) expect(data.application?.status, state.raw).toBe('EXPIRED');
  }
});

const VALID_INPUT: ApplicationInput = {
  firstName: 'Noor', lastName: 'Haddad', email: 'noor.haddad@example.test', phone: null,
  isSenior: false, isNonProfit: false, permitTypeCode: 'SIGN', siteAddress: '200 King Street',
  areaSqM: 3, description: 'Storefront sign',
};

const REFUSED_SUBMISSIONS: { slug: string; input: Partial<ApplicationInput>; message: string; risks: string[] }[] = [
  {
    slug: 'all-blank',
    input: { firstName: '', lastName: '', email: '', phone: '', permitTypeCode: '', siteAddress: '', areaSqM: 0, description: '' },
    message: 'Validation failed: First name is required; Last name is required; Area must be between 1 and 10000 square metres; Site address is required; Permit type is required',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'whitespace-names',
    input: { firstName: '   ', lastName: '\t' },
    message: 'Validation failed: First name is required; Last name is required',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'long-names',
    input: { firstName: 'A'.repeat(101), lastName: 'B'.repeat(101) },
    message: 'Validation failed: First name must be at most 100 characters; Last name must be at most 100 characters',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'invalid-email',
    input: { email: 'noor.haddad.example.test' },
    message: 'Validation failed: Email address is not valid',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'area-zero',
    input: { areaSqM: 0 },
    message: 'Validation failed: Area must be between 1 and 10000 square metres',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'area-too-large',
    input: { areaSqM: 10000.01 },
    message: 'Validation failed: Area must be between 1 and 10000 square metres',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'long-site-address',
    input: { siteAddress: `${'9'.repeat(196)} Road` },
    message: 'Validation failed: Site address must be at most 200 characters',
    risks: ['RISK-UI-03', 'RISK-API-02'],
  },
  {
    slug: 'unknown-permit-type',
    input: { permitTypeCode: 'NOPE' },
    message: 'Unknown or inactive permit type NOPE',
    risks: ['RISK-API-02'],
  },
  {
    slug: 'inactive-permit-type',
    input: { permitTypeCode: INACTIVE_PERMIT_TYPE },
    message: `Unknown or inactive permit type ${INACTIVE_PERMIT_TYPE}`,
    risks: ['RISK-API-02'],
  },
];

for (const s of REFUSED_SUBMISSIONS) {
  test(`submission refused: ${s.slug}`, { tag: apiTags(s.risks) }, async ({ gql }, testInfo) => {
    const res = await runApiCase(gql, testInfo, {
      suite: SUITE,
      caseId: `submit-refused-${s.slug}`,
      risks: s.risks,
      query: SUBMIT,
      variables: { input: { ...VALID_INPUT, ...s.input } },
    });
    expectMessage(expectErrors(res), s.message, res.raw);
  });
}
