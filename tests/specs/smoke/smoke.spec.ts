import { PERMIT_TYPES } from '../../src/api/operations';
import { expect, test } from '../../src/fixtures';

// Runs against whatever BASE_URL points at, including the released image in prod, so it
// only uses HTTP and the API (no page driver).
const TAGS = ['@smoke', '@RISK-REL-02'];

test('home page answers 200', { tag: TAGS }, async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
});

test('permitTypes is not empty', { tag: TAGS }, async ({ gql }) => {
  const res = await gql.send(PERMIT_TYPES);
  expect(res.status, res.raw).toBe(200);
  const body = res.body as { data?: { permitTypes?: unknown[] }; errors?: unknown };
  expect(body.errors, res.raw).toBeUndefined();
  expect(body.data?.permitTypes?.length ?? 0, res.raw).toBeGreaterThan(0);
});

test('health endpoint answers 200', { tag: TAGS }, async ({ request, env }) => {
  test.skip(env.target !== 'modern', 'the legacy app has no health endpoint');
  const response = await request.get('/healthz');
  expect(response.status()).toBe(200);
});
