import { expect, test } from '../../src/fixtures';
import { leakMarkers, LEAK_MARKERS } from '../../src/ui/checks';
import { pushEvidence, recordFindings } from '../../src/ui/findings';

const RISKS = ['RISK-SEC-02'];
const TAGS = ['@security', ...RISKS.map((r) => `@${r}`)];

// Unterminated selection set: a syntax error the server must report without internals.
const MALFORMED_QUERY = 'query Broken { permitTypes { code ';

test('error responses do not leak stack traces or internals', { tag: TAGS }, async ({ app, request, gql, env }, testInfo) => {
  expect(app.errorProbes.length, 'error probes the driver lists').toBeGreaterThan(0);
  const findings: { probe: string; status: number; leaks: string[] }[] = [];
  for (const probe of app.errorProbes) {
    const response = await request.get(probe);
    findings.push({ probe, status: response.status(), leaks: leakMarkers(await response.text()) });
  }
  const res = await gql.send(MALFORMED_QUERY);
  findings.push({ probe: `POST graphql ${MALFORMED_QUERY}`, status: res.status, leaks: leakMarkers(res.raw) });

  recordFindings(testInfo, env, {
    suite: 'security', caseId: 'errors', risks: RISKS, request: { markers: [...LEAK_MARKERS] }, actual: findings,
  });
  test.skip(env.parityMode === 'record', 'gate applies to the modern app');

  // Separate from the GraphQL probe, so a driver without error probes is empty evidence.
  pushEvidence(testInfo, 'error-probes', app.errorProbes.length);
  pushEvidence(testInfo, 'probes', findings.length);
  expect(findings.filter((f) => f.leaks.length > 0)).toEqual([]);
});
