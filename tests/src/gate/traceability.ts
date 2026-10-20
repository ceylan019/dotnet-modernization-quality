import type { CheckEvidence } from './evidence';
import type { TestResult } from './results';
import type { Risk } from './risks';

export type Stage = Risk['stage'];

// `test` names a test (`file: title`) or a check (`check: name`), as in a row's coveredBy.
export type GateProblem =
  | { kind: 'uncovered'; riskId: string }
  | { kind: 'unknown-tag'; tag: string; test: string }
  | { kind: 'untagged'; test: string }
  | { kind: 'empty-evidence'; test: string; evidence: string }
  | { kind: 'failing-test'; riskId: string; test: string }
  | { kind: 'failing-check'; riskId: string; check: string };

export interface GateRow { riskId: string; title: string; covered: boolean; coveredBy: string[] }
export interface GateResult { rows: GateRow[]; problems: GateProblem[] }

const ALLOWED_TAGS = new Set([
  '@smoke', '@regression', '@api', '@parity', '@ui', '@a11y', '@security', '@data', '@perf',
]);

const isRiskTag = (tag: string): boolean => tag.startsWith('@RISK-');
const testId = (t: TestResult): string => `${t.file}: ${t.title}`;
const checkId = (c: CheckEvidence): string => `check: ${c.name}`;

// A risk is covered when at least one passing test or check with real evidence names it and
// nothing that names it failed. Every failure is also listed as a problem, so it fails the gate
// whatever the stage of the risks it names.
export function evaluateGate(risks: Risk[], results: TestResult[], checks: CheckEvidence[], stage: Stage): GateResult {
  const known = new Set(risks.map((r) => `@${r.id}`));
  const problems: GateProblem[] = [];
  const coverage = new Map<string, string[]>();
  const failed = new Set<string>();
  const cover = (riskId: string, by: string): void => {
    coverage.set(riskId, [...(coverage.get(riskId) ?? []), by]);
  };

  for (const t of results) {
    const id = testId(t);
    const tags = [...new Set(t.tags)];
    for (const tag of tags) {
      if (isRiskTag(tag) ? !known.has(tag) : !ALLOWED_TAGS.has(tag)) {
        problems.push({ kind: 'unknown-tag', tag, test: id });
      }
    }
    const riskIds = tags.filter((tag) => known.has(tag)).map((tag) => tag.slice(1));
    if (riskIds.length === 0) problems.push({ kind: 'untagged', test: id });
    if (t.status === 'failed') {
      for (const riskId of riskIds) {
        failed.add(riskId);
        problems.push({ kind: 'failing-test', riskId, test: id });
      }
    }
    if (t.status !== 'passed') continue;

    const empty = t.evidence.filter((e) => e.examined <= 0);
    for (const e of empty) problems.push({ kind: 'empty-evidence', test: id, evidence: e.name });
    if (empty.length > 0) continue;
    for (const riskId of riskIds) cover(riskId, id);
  }

  for (const c of checks) {
    const id = checkId(c);
    const named = [...new Set(c.risks)];
    for (const riskId of named) {
      if (!known.has(`@${riskId}`)) problems.push({ kind: 'unknown-tag', tag: riskId, test: id });
    }
    const riskIds = named.filter((riskId) => known.has(`@${riskId}`));
    if (!c.passed) {
      for (const riskId of riskIds) {
        failed.add(riskId);
        problems.push({ kind: 'failing-check', riskId, check: c.name });
      }
      continue;
    }
    if (c.examined <= 0) {
      problems.push({ kind: 'empty-evidence', test: id, evidence: c.name });
      continue;
    }
    for (const riskId of riskIds) cover(riskId, id);
  }

  const rows = risks
    .filter((r) => r.stage === stage)
    .map((r) => {
      const coveredBy = coverage.get(r.id) ?? [];
      return { riskId: r.id, title: r.title, covered: coveredBy.length > 0 && !failed.has(r.id), coveredBy };
    });
  for (const row of rows) {
    if (!row.covered) problems.push({ kind: 'uncovered', riskId: row.riskId });
  }
  return { rows, problems };
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');

function describeProblem(p: GateProblem): string {
  switch (p.kind) {
    case 'uncovered': return `uncovered: ${p.riskId}`;
    case 'unknown-tag': return `unknown-tag: ${p.tag} in ${p.test}`;
    case 'untagged': return `untagged: ${p.test}`;
    case 'empty-evidence': return `empty-evidence: ${p.evidence} examined 0 in ${p.test}`;
    case 'failing-test': return `failing-test: ${p.riskId} in ${p.test}`;
    case 'failing-check': return `failing-check: ${p.riskId} in check: ${p.check}`;
  }
}

export function renderGateMarkdown(stage: Stage, gate: GateResult): string {
  const covered = gate.rows.filter((r) => r.covered).length;
  const lines = [
    `# Traceability gate: ${stage}`,
    '',
    `**${gate.problems.length === 0 ? 'PASS' : 'FAIL'}**, ${covered} of ${gate.rows.length} risks covered, ${gate.problems.length} problem(s).`,
    '',
    '| Risk | Title | Status | Covered by |',
    '|---|---|---|---|',
    ...gate.rows.map((r) =>
      `| ${r.riskId} | ${cell(r.title)} | ${r.covered ? 'covered' : 'NOT COVERED'} | ${cell(r.coveredBy.join(', '))} |`),
    '',
  ];
  if (gate.problems.length > 0) {
    lines.push('## Problems', '', ...gate.problems.map((p) => `- ${cell(describeProblem(p))}`), '');
  }
  return lines.join('\n');
}
