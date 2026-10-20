// k6 journeys against the GraphQL endpoint: search, fee quote, application by reference.
// Usage: k6 run -e BASE_URL=http://localhost:8080 -e SUMMARY_FILE=summary.json perf/journeys.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const DURATION = __ENV.DURATION || '30s';
const VUS = Number(__ENV.VUS || 5);
const SUMMARY_FILE = __ENV.SUMMARY_FILE || 'summary.json';

const SEARCH_TERMS = ['tremblay', 'gagnon', 'macdonald', 'roy', 'belanger', 'PRM-2026'];
const PERMIT_CODES = ['RENO', 'NEWB', 'DEMO'];
const HEADERS = { headers: { 'Content-Type': 'application/json' } };

const SEARCH = 'query Search($searchText: String, $page: Int, $pageSize: Int) { searchApplications(searchText: $searchText, page: $page, pageSize: $pageSize) { totalCount items { referenceNumber status totalAmount } } }';
const FEE_QUOTE = 'query FeeQuote($permitTypeCode: String!, $areaSqM: Decimal!, $isSenior: Boolean!, $isNonProfit: Boolean!) { feeQuote(permitTypeCode: $permitTypeCode, areaSqM: $areaSqM, isSenior: $isSenior, isNonProfit: $isNonProfit) { feeAmount hstAmount totalAmount } }';
const APPLICATION = 'query Application($referenceNumber: String!) { application(referenceNumber: $referenceNumber) { referenceNumber status totalAmount history { toStatus } } }';

function scenario(exec) {
  return { executor: 'constant-vus', vus: VUS, duration: DURATION, exec };
}

export const options = {
  scenarios: {
    search: scenario('search'),
    feeQuote: scenario('feeQuote'),
    applicationByReference: scenario('applicationByReference'),
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function post(query, variables, name, expectNoErrors) {
  const res = http.post(`${BASE_URL}/graphql`, JSON.stringify({ query, variables }), { ...HEADERS, tags: { name } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'no graphql errors': (r) => !expectNoErrors || !String(r.body).includes('"errors"'),
  });
  return res;
}

export function search() {
  post(SEARCH, { searchText: pick(SEARCH_TERMS), page: 1, pageSize: 20 }, 'search', true);
  sleep(0.2);
}

export function feeQuote() {
  post(FEE_QUOTE, { permitTypeCode: pick(PERMIT_CODES), areaSqM: 20 + Math.floor(Math.random() * 200), isSenior: false, isNonProfit: false }, 'feeQuote', true);
  sleep(0.2);
}

export function applicationByReference() {
  // Reference numbers have gaps, so a miss is a normal answer here.
  const n = 1 + Math.floor(Math.random() * 400);
  post(APPLICATION, { referenceNumber: `PRM-2026-${String(n).padStart(6, '0')}` }, 'applicationByReference', false);
  sleep(0.2);
}

// The raw end-of-test data is kept as the summary; k6-evidence.ts reads it.
export function handleSummary(data) {
  return { [SUMMARY_FILE]: JSON.stringify(data, null, 2) };
}
