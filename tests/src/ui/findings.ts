import type { TestInfo } from '@playwright/test';
import type { TestEnv } from '../config/env';
import { readBaselineCase } from '../parity/baseline-store';
import { diffJson } from '../parity/diff';
import { expectParity } from '../parity/expect-parity';
import type { Json } from '../parity/normalize';

// Accessibility and security checks are gates on the modern app, not parity: the modern app
// should be better than legacy, not equal to it. In record mode each check stores what legacy
// shows (the "before" of the README) and then skips its gate. In compare mode nothing is
// stored and the gate judges the app under test.

export interface Findings {
  suite: string;
  caseId: string;
  risks: string[];
  request: Json;
  actual: Json;
}

export function recordFindings(testInfo: TestInfo, env: TestEnv, f: Findings): void {
  if (env.parityMode === 'record') expectParity(testInfo, f);
}

// The legacy findings of a case, for a gate that is relative to legacy (axe counts). The
// request must equal the recorded one, or the two runs did not check the same thing.
export function legacyFindings(suite: string, caseId: string, request: Json): Json {
  const baseline = readBaselineCase(suite, caseId);
  if (!baseline) throw new Error(`No legacy baseline for ${suite}/${caseId}`);
  const diffs = diffJson(baseline.request, request, '$request');
  if (diffs.length > 0) {
    throw new Error(`Request for ${suite}/${caseId} differs from the recorded request, re-record the baseline: ${diffs.map((d) => d.path).join(', ')}`);
  }
  return baseline.normalized;
}

// What a gate examined. The traceability gate treats a count of 0 as empty evidence.
export function pushEvidence(testInfo: TestInfo, name: string, examined: number): void {
  testInfo.annotations.push({ type: 'evidence', description: `${name}=${examined}` });
}
