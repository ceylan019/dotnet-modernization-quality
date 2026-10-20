import { expect, it } from 'vitest';
import { mutationEvidence } from '../src/gate/mutation-evidence';

function report(statuses: Record<string, number>) {
  const mutants = Object.entries(statuses).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status })));
  return { files: { 'a.ts': { mutants } } };
}

it('passes at or above the threshold and counts every scored mutant', () => {
  const e = mutationEvidence(report({ Killed: 17, Survived: 3 }));
  expect(e).toMatchObject({ name: 'mutation-score', risks: ['RISK-TEST-01'], passed: true, examined: 20 });
  expect(e.detail).toContain('85.00%');
});

it('fails just below the threshold', () => {
  const e = mutationEvidence(report({ Killed: 84, Survived: 16 }));
  expect(e.passed).toBe(false);
  expect(e.detail).toContain('84.00%');
});

it('counts timeouts as detected and no-coverage as missed', () => {
  const e = mutationEvidence(report({ Killed: 8, Timeout: 1, NoCoverage: 1 }));
  expect(e).toMatchObject({ passed: true, examined: 10 });
  expect(mutationEvidence(report({ Killed: 8, NoCoverage: 2 })).passed).toBe(false);
});

it('ignores compile errors and ignored mutants', () => {
  const e = mutationEvidence(report({ Killed: 9, Survived: 1, CompileError: 50, Ignored: 5 }));
  expect(e.examined).toBe(10);
});

it('does not pass when nothing was killed even if the score is high', () => {
  expect(mutationEvidence(report({ Timeout: 20 })).passed).toBe(false);
});

it('refuses a report without scored mutants', () => {
  expect(() => mutationEvidence({ files: {} })).toThrow('no scored mutants');
  expect(() => mutationEvidence(report({ CompileError: 3 }))).toThrow('no scored mutants');
});

it('refuses input that is not a Stryker report', () => {
  expect(() => mutationEvidence({})).toThrow('Not a Stryker mutation report');
});
