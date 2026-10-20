import { writeFileSync } from 'node:fs';
import { isEntrypoint } from './entrypoint';
import { loadRisks, type Risk } from './risks';

const STAGES: Risk['stage'][] = ['qa', 'staging', 'prod'];

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function summaryRow(label: string, risks: Risk[]): string {
  const high = risks.filter((r) => r.likelihood * r.impact >= 6).length;
  return `| ${label} | ${risks.length} | ${high} |`;
}

function summary(risks: Risk[]): string[] {
  return [
    '| Stage that must prove it | Risks | Score 6 or more |',
    '|---|---|---|',
    ...STAGES.map((stage) => summaryRow(stage, risks.filter((r) => r.stage === stage))),
    summaryRow('total', risks),
  ];
}

export function renderRiskRegister(risks: Risk[]): string {
  const rows = risks.map((r) =>
    `| ${r.id} | ${cell(r.title)} | ${r.likelihood} | ${r.impact} | ${r.likelihood * r.impact} | ${cell(r.detection)} | ${r.stage} | ${r.status} |`,
  );
  return [
    '# Risk register',
    '',
    '<!-- Generated from risks.json by `npm run risks:md` in tests/. Edit risks.json, then regenerate. -->',
    '',
    'Each risk is a way this migration can break quietly. Every test carries the IDs of the risks it covers as tags, and the traceability gate fails a stage when one of its risks has no passing test with real evidence behind it. The reasoning behind each risk, with references to the legacy code and the seed data, is in [test-strategy.md](test-strategy.md#5-risk-analysis).',
    '',
    '**Likelihood** is the chance that a conversion done without knowledge of this register gets it wrong: 1 unlikely, 2 possible, 3 likely.',
    '**Impact** is the harm if it reaches users or partner systems: 1 cosmetic or easily worked around, 2 wrong behavior a user or partner notices, 3 wrong money, dates or data, a security exposure, or a broken partner integration.',
    '**Score** is likelihood times impact. 6 and above is high, 3 and 4 are medium, 1 and 2 are low.',
    '**Stage** is the pipeline stage whose gate must see the risk covered: `qa` for behavior, `staging` for data migration and load, `prod` for the release itself.',
    '',
    '## Summary',
    '',
    ...summary(risks),
    '',
    '## Register',
    '',
    '| ID | Risk | Likelihood | Impact | Score (L×I) | Detection | Stage | Status |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

export function runRiskRegisterCli(argv: string[]): string {
  const out = argv[0] ?? '../docs/quality/risk-register.md';
  writeFileSync(out, renderRiskRegister(loadRisks()));
  return `Wrote ${out}`;
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  console.log(runRiskRegisterCli(process.argv.slice(2)));
}
