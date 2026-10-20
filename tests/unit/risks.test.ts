import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { isEntrypoint } from '../src/gate/entrypoint';
import { renderRiskRegister, runRiskRegisterCli } from '../src/gate/risk-register-md';
import { loadRisks, parseRisks, type Risk } from '../src/gate/risks';

const QA_IDS = [
  'RISK-FEE-01', 'RISK-FEE-02', 'RISK-DATE-01', 'RISK-DATE-02', 'RISK-DATE-03',
  'RISK-SEARCH-01', 'RISK-SEARCH-02', 'RISK-SEARCH-03', 'RISK-ORDER-01', 'RISK-ORDER-02',
  'RISK-WF-01', 'RISK-REF-01', 'RISK-API-01', 'RISK-API-02', 'RISK-API-03',
  'RISK-UI-01', 'RISK-UI-02', 'RISK-UI-03', 'RISK-A11Y-01', 'RISK-A11Y-02',
  'RISK-A11Y-03', 'RISK-A11Y-04', 'RISK-SEC-01', 'RISK-SEC-02', 'RISK-SEC-03',
  'RISK-HEALTH-01', 'RISK-PERF-02', 'RISK-TEST-01',
];
const STAGING_IDS = ['RISK-DATA-01', 'RISK-DATA-02', 'RISK-DATA-03', 'RISK-DATA-04', 'RISK-PERF-01'];
const PROD_IDS = ['RISK-REL-01', 'RISK-REL-02', 'RISK-REL-03', 'RISK-REL-04'];

const sample: Risk = {
  id: 'RISK-FEE-01',
  title: 'Fee halves round differently',
  area: 'Fees',
  likelihood: 3,
  impact: 2,
  detection: 'Fee quote parity',
  stage: 'qa',
  status: 'open',
};

it('loadRisks: loads the 37 committed risks with unique IDs', () => {
  const risks = loadRisks();
  expect(risks).toHaveLength(37);
  expect(new Set(risks.map((r) => r.id)).size).toBe(37);
});

it('loadRisks: assigns each agreed ID to its stage', () => {
  const risks = loadRisks();
  const ids = (stage: Risk['stage']) => risks.filter((r) => r.stage === stage).map((r) => r.id);
  expect(ids('qa')).toEqual(QA_IDS);
  expect(ids('staging')).toEqual(STAGING_IDS);
  expect(ids('prod')).toEqual(PROD_IDS);
});

it('parseRisks: accepts a valid risk', () => {
  expect(parseRisks([sample])).toEqual([sample]);
});

it('parseRisks: rejects a duplicate ID', () => {
  expect(() => parseRisks([sample, { ...sample, title: 'Copy' }])).toThrow('1.id: Duplicate risk ID RISK-FEE-01');
});

it.each(['RISK-fee-01', 'RISK-FEE-1', 'RISK-FEE-001', 'FEE-01', 'RISK-FEE-01 '])('parseRisks: rejects the malformed ID %j', (id) => {
  expect(() => parseRisks([{ ...sample, id }])).toThrow('0.id: must look like RISK-AREA-01');
});

it.each([0, 4, 2.5])('parseRisks: rejects likelihood %j', (likelihood) => {
  expect(() => parseRisks([{ ...sample, likelihood }])).toThrow('0.likelihood: ');
});

it.each([0, 4])('parseRisks: rejects impact %j', (impact) => {
  expect(() => parseRisks([{ ...sample, impact }])).toThrow('0.impact: ');
});

it('parseRisks: rejects an unknown stage', () => {
  expect(() => parseRisks([{ ...sample, stage: 'dev' }])).toThrow('0.stage: ');
});

it('parseRisks: rejects a status other than open', () => {
  expect(() => parseRisks([{ ...sample, status: 'closed' }])).toThrow('0.status: ');
});

it('parseRisks: rejects an empty detection', () => {
  expect(() => parseRisks([{ ...sample, detection: '' }])).toThrow('0.detection: ');
});

it('parseRisks: rejects a misspelled field instead of ignoring it', () => {
  expect(() => parseRisks([{ ...sample, likelyhood: 2 }])).toThrow('Unrecognized key: "likelyhood"');
});

it('parseRisks: rejects an empty register', () => {
  expect(() => parseRisks([])).toThrow('the register needs at least one risk');
});

const tableRows = (markdown: string) => markdown.split('\n').filter((line) => line.startsWith('| RISK-'));

it('renderRiskRegister: renders one row per risk with the score as likelihood times impact', () => {
  const rows = tableRows(renderRiskRegister([sample, { ...sample, id: 'RISK-FEE-02', likelihood: 2, impact: 3 }]));
  expect(rows).toEqual([
    '| RISK-FEE-01 | Fee halves round differently | 3 | 2 | 6 | Fee quote parity | qa | open |',
    '| RISK-FEE-02 | Fee halves round differently | 2 | 3 | 6 | Fee quote parity | qa | open |',
  ]);
});

it('renderRiskRegister: has the agreed columns', () => {
  expect(renderRiskRegister([sample])).toContain(
    '| ID | Risk | Likelihood | Impact | Score (L×I) | Detection | Stage | Status |',
  );
});

it('renderRiskRegister: escapes pipes and flattens line breaks so a cell cannot break the table', () => {
  const [row] = tableRows(renderRiskRegister([{ ...sample, title: 'a | b', detection: 'line one\nline two' }]));
  expect(row).toBe('| RISK-FEE-01 | a \\| b | 3 | 2 | 6 | line one line two | qa | open |');
});

it('renderRiskRegister: matches the committed risk-register.md', () => {
  const committed = readFileSync('../docs/quality/risk-register.md', 'utf8');
  expect(renderRiskRegister(loadRisks())).toBe(committed);
});

it('parseRisks: accepts every valid score and stage', () => {
  for (const likelihood of [1, 2, 3]) for (const impact of [1, 2, 3]) {
    expect(parseRisks([{ ...sample, likelihood, impact }])).toHaveLength(1);
  }
  for (const stage of ['qa', 'staging', 'prod']) expect(parseRisks([{ ...sample, stage }])).toHaveLength(1);
});

it('parseRisks: accepts multi-character and numeric area codes', () => {
  expect(parseRisks([{ ...sample, id: 'RISK-A11Y-04' }])).toHaveLength(1);
  expect(parseRisks([{ ...sample, id: 'RISK-X-01' }])).toHaveLength(1);
});

it.each(['XRISK-FEE-01', 'RISK--01', 'RISK-FE-E-01', 'RISK-fee-01', 'RISK-FEE-0', 'RISK-FEE-012', 'RISK-FEE-AB'])('parseRisks: rejects the id %j', (id) => {
  expect(() => parseRisks([{ ...sample, id }])).toThrow('must look like RISK-AREA-01');
});

it.each(['title', 'area', 'detection'])('parseRisks: accepts a long %s and rejects an empty one', (field) => {
  expect(parseRisks([{ ...sample, [field]: 'a longer text' }])).toHaveLength(1);
  expect(() => parseRisks([{ ...sample, [field]: '' }])).toThrow(`0.${field}: `);
});

it('parseRisks: accepts more than one risk and names the source in errors', () => {
  expect(parseRisks([sample, { ...sample, id: 'RISK-FEE-02' }])).toHaveLength(2);
  expect(() => parseRisks([{ ...sample, status: 'closed' }], 'my.json')).toThrow('Invalid risk register my.json: 0.status: ');
  expect(() => parseRisks([{ ...sample, status: 'closed' }])).toThrow('Invalid risk register risks: ');
});

it('parseRisks: joins several problems with a semicolon and omits the path for a top-level problem', () => {
  expect(() => parseRisks([{ ...sample, stage: 'dev', status: 'closed' }])).toThrow(/0\.(stage|status): .*; 0\.(stage|status): /);
  expect(() => parseRisks([])).toThrow('Invalid risk register risks: the register needs at least one risk');
  expect(() => parseRisks('nope')).toThrow(/Invalid risk register risks: /);
});

it('loadRisks: names the file it was asked to load', () => {
  expect(() => loadRisks('/nonexistent/risks.json')).toThrow(/ENOENT/);
  expect(loadRisks('../docs/quality/risks.json')).toHaveLength(37);
});

it('runRiskRegisterCli writes the rendered register to the given file and reports it', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'rr-')), 'register.md');
  expect(runRiskRegisterCli([out])).toBe(`Wrote ${out}`);
  expect(readFileSync(out, 'utf8')).toBe(renderRiskRegister(loadRisks()));
});

it('isEntrypoint is true only for the script node was started with', () => {
  const file = join(tmpdir(), 'x.ts');
  expect(isEntrypoint(file, pathToFileURL(file).href)).toBe(true);
  expect(isEntrypoint(file, pathToFileURL(join(tmpdir(), 'y.ts')).href)).toBe(false);
  expect(isEntrypoint(undefined, pathToFileURL(file).href)).toBe(false);
  expect(isEntrypoint('', pathToFileURL('').href)).toBe(false);
});
