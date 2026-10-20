import type { CheckEvidence } from './evidence';
import type { TestResult } from './results';
import type { Risk } from './risks';

export type Stage = Risk['stage'];

export type GateProblem =
  | { kind: 'uncovered'; riskId: string }
  | { kind: 'unknown-tag'; tag: string; test: string }
  | { kind: 'untagged'; test: string }
  | { kind: 'empty-evidence'; test: string; evidence: string };

export interface GateRow { riskId: string; title: string; covered: boolean; coveredBy: string[] }
export interface GateResult { rows: GateRow[]; problems: GateProblem[] }

const ALLOWED_TAGS = new Set([
  '@smoke', '@regression', '@api', '@parity', '@ui', '@a11y', '@security', '@data', '@perf',
]);

const isRiskTag = (tag: string): boolean => tag.startsWith('@RISK-');
const testId = (t: TestResult): string => `${t.file}: ${t.title}`;

export function evaluateGate(risks: Risk[], results: TestResult[], checks: CheckEvidence[], stage: Stage): GateResult {
  const known = new Set(risks.map((r) => `@${r.id}`));
  const problems: GateProblem[] = [];
  const coverage = new Map<string, string[]>();
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
    const riskTags = tags.filter((tag) => known.has(tag));
    if (riskTags.length === 0) problems.push({ kind: 'untagged', test: id });
    if (t.status !== 'passed') continue;

    const empty = t.evidence.filter((e) => e.examined <= 0);
    for (const e of empty) problems.push({ kind: 'empty-evidence', test: id, evidence: e.name });
    if (empty.length > 0) continue;
    for (const tag of riskTags) cover(tag.slice(1), id);
  }

  for (const c of checks) {
    if (!c.passed || c.examined <= 0) continue;
    for (const riskId of c.risks) cover(riskId, `check: ${c.name}`);
  }

  const rows = risks
    .filter((r) => r.stage === stage)
    .map((r) => {
      const coveredBy = coverage.get(r.id) ?? [];
      return { riskId: r.id, title: r.title, covered: coveredBy.length > 0, coveredBy };
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
