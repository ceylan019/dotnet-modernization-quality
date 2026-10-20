import type { TestInfo } from '@playwright/test';
import { loadEnv } from '../config/env';
import { filterApproved, loadApprovedDifferences } from './approved-differences';
import { readBaselineCase, writeBaselineCase } from './baseline-store';
import { diffJson, type Difference } from './diff';
import type { Json } from './normalize';

export interface ParityArgs {
  suite: string;
  caseId: string;
  risks: string[];
  request: Json;
  actual: Json;
}

function describeDifference(d: Difference): string {
  const parts = [`${d.path} (${d.kind})`];
  if ('expected' in d) parts.push(`expected ${JSON.stringify(d.expected)}`);
  if ('actual' in d) parts.push(`actual ${JSON.stringify(d.actual)}`);
  return parts.join(' ');
}

// Mode comes from PARITY_MODE (validated by loadEnv), baselines from BASELINES_DIR and the
// approved list from APPROVED_DIFFERENCES_FILE. There is deliberately no way to override them per call.
export function expectParity(testInfo: TestInfo, args: ParityArgs): void {
  const mode = loadEnv().parityMode;

  if (mode === 'record') {
    writeBaselineCase({
      suite: args.suite,
      caseId: args.caseId,
      risks: args.risks,
      request: args.request,
      normalized: args.actual,
      recordedAt: new Date().toISOString(),
    });
    testInfo.annotations.push({ type: 'baseline-recorded', description: `${args.suite}/${args.caseId}` });
    return;
  }

  testInfo.annotations.push({ type: 'evidence', description: 'parity=1' });
  const baseline = readBaselineCase(args.suite, args.caseId);
  if (!baseline) throw new Error(`No legacy baseline for ${args.suite}/${args.caseId}`);

  const requestDiffs = diffJson(baseline.request, args.request, '$request');
  if (requestDiffs.length > 0) {
    throw new Error(
      `Request for ${args.suite}/${args.caseId} differs from the recorded request, re-record the baseline:\n`
      + requestDiffs.map(describeDifference).join('\n'),
    );
  }

  const approved = loadApprovedDifferences(process.env.APPROVED_DIFFERENCES_FILE || undefined);
  const { remaining, applied } = filterApproved(
    diffJson(baseline.normalized, args.actual), args.suite, args.caseId, approved,
  );
  for (const id of applied) testInfo.annotations.push({ type: 'approved-difference', description: id });

  if (remaining.length > 0) {
    throw new Error(
      `Parity failed for ${args.suite}/${args.caseId}, ${remaining.length} difference(s):\n`
      + remaining.map(describeDifference).join('\n'),
    );
  }
}
