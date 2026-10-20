import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { writeCheckEvidence, type CheckEvidence } from '../src/gate/evidence';
import { runGateCli } from '../src/gate/gate-cli';
import type { Risk } from '../src/gate/risks';
import type { TestResult } from '../src/gate/results';
import { evaluateGate, renderGateMarkdown } from '../src/gate/traceability';

const risk = (id: string, stage: Risk['stage'] = 'qa'): Risk => ({
  id, title: `title of ${id}`, area: 'Area', likelihood: 2, impact: 2, detection: 'd', stage, status: 'open',
});
const result = (over: Partial<TestResult> = {}): TestResult => ({
  title: 'a test', file: 'f.spec.ts', status: 'passed', tags: ['@RISK-A-01'], evidence: [], ...over,
});
const check = (over: Partial<CheckEvidence> = {}): CheckEvidence => ({
  name: 'a check', risks: ['RISK-A-01'], passed: true, examined: 5, detail: '', ...over,
});
const risks = [risk('RISK-A-01'), risk('RISK-B-01')];

it('a passed tagged test covers its risk and the other risk is uncovered', () => {
  const g = evaluateGate(risks, [result()], [], 'qa');
  expect(g.rows).toEqual([
    { riskId: 'RISK-A-01', title: 'title of RISK-A-01', covered: true, coveredBy: ['f.spec.ts: a test'] },
    { riskId: 'RISK-B-01', title: 'title of RISK-B-01', covered: false, coveredBy: [] },
  ]);
  expect(g.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-B-01' }]);
});

it('a risk covered only by a skipped test is uncovered', () => {
  const g = evaluateGate([risk('RISK-A-01')], [result({ status: 'skipped' })], [], 'qa');
  expect(g.rows[0]!.covered).toBe(false);
  expect(g.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-A-01' }]);
});

it('a failed test does not cover', () => {
  const g = evaluateGate([risk('RISK-A-01')], [result({ status: 'failed' })], [], 'qa');
  expect(g.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-A-01' }]);
});

it('a passing parity test with parity=0 evidence is empty-evidence and does not cover', () => {
  const t = result({ tags: ['@RISK-A-01', '@parity'], evidence: [{ name: 'parity', examined: 0 }] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.rows[0]!.covered).toBe(false);
  expect(g.problems).toContainEqual({ kind: 'empty-evidence', test: 'f.spec.ts: a test', evidence: 'parity' });
  expect(g.problems).toContainEqual({ kind: 'uncovered', riskId: 'RISK-A-01' });
});

it('one empty evidence entry among real ones still blocks coverage and names only the empty entry', () => {
  const t = result({ evidence: [{ name: 'rows', examined: 9 }, { name: 'parity', examined: 0 }] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.rows[0]!.covered).toBe(false);
  expect(g.problems.filter((p) => p.kind === 'empty-evidence')).toEqual([
    { kind: 'empty-evidence', test: 'f.spec.ts: a test', evidence: 'parity' },
  ]);
});

it('a passed test with all evidence above zero covers', () => {
  const t = result({ evidence: [{ name: 'parity', examined: 1 }] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.problems).toEqual([]);
  expect(g.rows[0]!.covered).toBe(true);
});

it('a failed test with zero evidence reports no empty-evidence problem', () => {
  const t = result({ status: 'failed', evidence: [{ name: 'parity', examined: 0 }] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-A-01' }]);
});

it('staging and prod risks are ignored at qa and required at their own stage', () => {
  const all = [risk('RISK-A-01'), risk('RISK-S-01', 'staging'), risk('RISK-P-01', 'prod')];
  const qa = evaluateGate(all, [result()], [], 'qa');
  expect(qa.rows.map((r) => r.riskId)).toEqual(['RISK-A-01']);
  expect(qa.problems).toEqual([]);
  const staging = evaluateGate(all, [], [], 'staging');
  expect(staging.rows.map((r) => r.riskId)).toEqual(['RISK-S-01']);
  expect(staging.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-S-01' }]);
  const prod = evaluateGate(all, [], [], 'prod');
  expect(prod.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-P-01' }]);
});

it('a risk tag that is not in the register is an unknown-tag problem, once per test and tag', () => {
  const t = result({ tags: ['@RISK-A-01', '@RISK-NOPE-01', '@RISK-NOPE-01'] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.problems).toEqual([{ kind: 'unknown-tag', tag: '@RISK-NOPE-01', test: 'f.spec.ts: a test' }]);
  expect(g.rows[0]!.covered).toBe(true);
});

it('a tag that is neither a risk nor an allowed tag is an unknown-tag problem', () => {
  const t = result({ tags: ['@RISK-A-01', '@smoke', '@wip'] });
  const g = evaluateGate([risk('RISK-A-01')], [t], [], 'qa');
  expect(g.problems).toEqual([{ kind: 'unknown-tag', tag: '@wip', test: 'f.spec.ts: a test' }]);
});

it('every allowed non-risk tag is accepted', () => {
  const tags = ['@RISK-A-01', '@smoke', '@regression', '@api', '@parity', '@ui', '@a11y', '@security', '@data', '@perf'];
  expect(evaluateGate([risk('RISK-A-01')], [result({ tags })], [], 'qa').problems).toEqual([]);
});

it('a test with no risk tag is untagged, whatever its status', () => {
  const passed = result({ title: 'p', tags: ['@smoke'] });
  const skipped = result({ title: 's', tags: [], status: 'skipped' });
  const g = evaluateGate([], [passed, skipped], [], 'qa');
  expect(g.problems).toEqual([
    { kind: 'untagged', test: 'f.spec.ts: p' },
    { kind: 'untagged', test: 'f.spec.ts: s' },
  ]);
});

it('a test that only carries an unknown risk tag is unknown-tag and untagged', () => {
  const g = evaluateGate([risk('RISK-A-01')], [result({ tags: ['@RISK-NOPE-01'] })], [], 'qa');
  expect(g.problems).toContainEqual({ kind: 'unknown-tag', tag: '@RISK-NOPE-01', test: 'f.spec.ts: a test' });
  expect(g.problems).toContainEqual({ kind: 'untagged', test: 'f.spec.ts: a test' });
});

it('a passed check with examined above zero covers its risks', () => {
  const g = evaluateGate([risk('RISK-A-01')], [], [check()], 'qa');
  expect(g.rows[0]).toMatchObject({ covered: true, coveredBy: ['check: a check'] });
  expect(g.problems).toEqual([]);
});

it('a check with zero examined or that did not pass does not cover', () => {
  const zero = evaluateGate([risk('RISK-A-01')], [], [check({ examined: 0 })], 'qa');
  expect(zero.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-A-01' }]);
  const failed = evaluateGate([risk('RISK-A-01')], [], [check({ passed: false })], 'qa');
  expect(failed.problems).toEqual([{ kind: 'uncovered', riskId: 'RISK-A-01' }]);
});

it('a check only covers the risks it lists', () => {
  const g = evaluateGate(risks, [], [check({ risks: ['RISK-B-01'] })], 'qa');
  expect(g.rows.map((r) => r.covered)).toEqual([false, true]);
});

it('coveredBy lists every covering test and check', () => {
  const g = evaluateGate([risk('RISK-A-01')], [result({ title: 't1' }), result({ title: 't2' })], [check()], 'qa');
  expect(g.rows[0]!.coveredBy).toEqual(['f.spec.ts: t1', 'f.spec.ts: t2', 'check: a check']);
});

it('renders a markdown matrix with the verdict, one row per risk and the problems', () => {
  const g = evaluateGate(risks, [result({ tags: ['@RISK-A-01', '@wip'] })], [], 'qa');
  const md = renderGateMarkdown('qa', g);
  expect(md).toContain('# Traceability gate: qa');
  expect(md).toContain('**FAIL**');
  expect(md).toContain('| RISK-A-01 | title of RISK-A-01 | covered | f.spec.ts: a test |');
  expect(md).toContain('| RISK-B-01 | title of RISK-B-01 | NOT COVERED |  |');
  expect(md).toContain('1 of 2 risks covered');
  expect(md).toContain('uncovered: RISK-B-01');
  expect(md).toContain('unknown-tag: @wip in f.spec.ts: a test');
});

it('renders every problem kind and escapes pipes in table cells', () => {
  const g = {
    rows: [{ riskId: 'RISK-A-01', title: 'a | b', covered: true, coveredBy: ['x | y'] }],
    problems: [
      { kind: 'untagged' as const, test: 't1' },
      { kind: 'empty-evidence' as const, test: 't2', evidence: 'parity' },
    ],
  };
  const md = renderGateMarkdown('staging', g);
  expect(md).toContain('| RISK-A-01 | a \\| b | covered | x \\| y |');
  expect(md).toContain('untagged: t1');
  expect(md).toContain('empty-evidence: parity examined 0 in t2');
});

it('renders PASS when there are no problems', () => {
  const md = renderGateMarkdown('qa', evaluateGate([risk('RISK-A-01')], [result()], [], 'qa'));
  expect(md).toContain('**PASS**');
  expect(md).not.toContain('## Problems');
});

const cliDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-cli-'));
  const risksFile = join(dir, 'risks.json');
  writeFileSync(risksFile, JSON.stringify([{
    id: 'RISK-A-01', title: 'A', area: 'a', likelihood: 1, impact: 1, detection: 'd', stage: 'qa', status: 'open',
  }]));
  const pw = join(dir, 'pw.json');
  const ev = join(dir, 'evidence');
  const out = join(dir, 'out');
  return { dir, risksFile, pw, ev, out };
};
const args = (c: ReturnType<typeof cliDir>) => [
  '--stage', 'qa', '--playwright', c.pw, '--evidence', c.ev, '--risks', c.risksFile, '--out', c.out,
];
const pwReport = (tags: string[], status = 'expected') => JSON.stringify({
  suites: [{ title: 'f', file: 'f.spec.ts', specs: [{ title: 't', file: 'f.spec.ts', tags, tests: [{ status, expectedStatus: 'passed', annotations: [], results: [] }] }] }],
});

it('CLI exits 0 on a clean report, writes traceability.json and appends to the step summary', () => {
  const c = cliDir();
  writeFileSync(c.pw, pwReport(['RISK-A-01']));
  const summary = join(c.dir, 'summary.md');
  const run = runGateCli(args(c), { GITHUB_STEP_SUMMARY: summary });
  expect(run.exitCode).toBe(0);
  expect(run.output).toContain('**PASS**');
  const json = JSON.parse(readFileSync(join(c.out, 'traceability.json'), 'utf8')) as { stage: string; problems: unknown[]; rows: unknown[] };
  expect(json.stage).toBe('qa');
  expect(json.problems).toEqual([]);
  expect(json.rows).toHaveLength(1);
  expect(readFileSync(summary, 'utf8')).toBe(run.output);
});

it('CLI appends to an existing step summary instead of replacing it', () => {
  const c = cliDir();
  writeFileSync(c.pw, pwReport(['RISK-A-01']));
  const summary = join(c.dir, 'summary.md');
  writeFileSync(summary, 'before\n');
  runGateCli(args(c), { GITHUB_STEP_SUMMARY: summary });
  expect(readFileSync(summary, 'utf8').startsWith('before\n')).toBe(true);
  expect(readFileSync(summary, 'utf8')).toContain('Traceability gate');
});

it('CLI exits 1 when there are problems and does not touch a summary when the variable is unset', () => {
  const c = cliDir();
  writeFileSync(c.pw, pwReport(['smoke']));
  const run = runGateCli(args(c), {});
  expect(run.exitCode).toBe(1);
  expect(run.output).toContain('**FAIL**');
  expect(existsSync(join(c.dir, 'summary.md'))).toBe(false);
});

it('CLI counts a passed check from the evidence directory', () => {
  const c = cliDir();
  writeFileSync(c.pw, pwReport(['smoke'], 'skipped'));
  writeCheckEvidence({ name: 'chk', risks: ['RISK-A-01'], passed: true, examined: 3, detail: '' }, c.ev);
  const run = runGateCli(args(c), {});
  expect(run.output).toContain('check: chk');
  expect(run.exitCode).toBe(1);
});

it('CLI rejects a missing or invalid stage, unknown flags and flags without a value', () => {
  expect(() => runGateCli([], {})).toThrow(/--stage/);
  expect(() => runGateCli(['--stage', 'dev'], {})).toThrow(/--stage/);
  expect(() => runGateCli(['--stage', 'qa', '--bogus', 'x'], {})).toThrow(/--bogus/);
  expect(() => runGateCli(['--stage'], {})).toThrow(/--stage/);
});

it('renders the exact markdown layout', () => {
  const g = evaluateGate([risk('RISK-A-01'), risk('RISK-B-01')], [result()], [], 'qa');
  expect(renderGateMarkdown('qa', g)).toBe([
    '# Traceability gate: qa',
    '',
    '**FAIL**, 1 of 2 risks covered, 1 problem(s).',
    '',
    '| Risk | Title | Status | Covered by |',
    '|---|---|---|---|',
    '| RISK-A-01 | title of RISK-A-01 | covered | f.spec.ts: a test |',
    '| RISK-B-01 | title of RISK-B-01 | NOT COVERED |  |',
    '',
    '## Problems',
    '',
    '- uncovered: RISK-B-01',
    '',
  ].join('\n'));
});

it('CLI creates a nested output directory and a clear error names the unreadable report', () => {
  const c = cliDir();
  writeFileSync(c.pw, pwReport(['RISK-A-01']));
  const nested = join(c.out, 'deep', 'er');
  const a = args(c);
  a[a.indexOf('--out') + 1] = nested;
  runGateCli(a, {});
  expect(existsSync(join(nested, 'traceability.json'))).toBe(true);
  expect(() => runGateCli(['--stage', 'qa', '--playwright', join(c.dir, 'nope.json'), '--risks', c.risksFile], {})).toThrow(/nope\.json/);
});
