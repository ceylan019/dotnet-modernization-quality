import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderRiskRegister } from '../src/gate/risk-register-md';
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

describe('loadRisks', () => {
  const risks = loadRisks();

  it('loads the 37 committed risks with unique IDs', () => {
    expect(risks).toHaveLength(37);
    expect(new Set(risks.map((r) => r.id)).size).toBe(37);
  });

  it('assigns each agreed ID to its stage', () => {
    const ids = (stage: Risk['stage']) => risks.filter((r) => r.stage === stage).map((r) => r.id);
    expect(ids('qa')).toEqual(QA_IDS);
    expect(ids('staging')).toEqual(STAGING_IDS);
    expect(ids('prod')).toEqual(PROD_IDS);
  });
});

describe('parseRisks', () => {
  it('accepts a valid risk', () => {
    expect(parseRisks([sample])).toEqual([sample]);
  });

  it('rejects a duplicate ID', () => {
    expect(() => parseRisks([sample, { ...sample, title: 'Copy' }])).toThrow('1.id: Duplicate risk ID RISK-FEE-01');
  });

  it.each(['RISK-fee-01', 'RISK-FEE-1', 'RISK-FEE-001', 'FEE-01', 'RISK-FEE-01 '])('rejects the malformed ID %j', (id) => {
    expect(() => parseRisks([{ ...sample, id }])).toThrow('0.id: must look like RISK-AREA-01');
  });

  it.each([0, 4, 2.5])('rejects likelihood %j', (likelihood) => {
    expect(() => parseRisks([{ ...sample, likelihood }])).toThrow('0.likelihood: ');
  });

  it.each([0, 4])('rejects impact %j', (impact) => {
    expect(() => parseRisks([{ ...sample, impact }])).toThrow('0.impact: ');
  });

  it('rejects an unknown stage', () => {
    expect(() => parseRisks([{ ...sample, stage: 'dev' }])).toThrow('0.stage: ');
  });

  it('rejects a status other than open', () => {
    expect(() => parseRisks([{ ...sample, status: 'closed' }])).toThrow('0.status: ');
  });

  it('rejects an empty detection', () => {
    expect(() => parseRisks([{ ...sample, detection: '' }])).toThrow('0.detection: ');
  });

  it('rejects a misspelled field instead of ignoring it', () => {
    expect(() => parseRisks([{ ...sample, likelyhood: 2 }])).toThrow('Unrecognized key: "likelyhood"');
  });

  it('rejects an empty register', () => {
    expect(() => parseRisks([])).toThrow('the register needs at least one risk');
  });
});

describe('renderRiskRegister', () => {
  const tableRows = (markdown: string) => markdown.split('\n').filter((line) => line.startsWith('| RISK-'));

  it('renders one row per risk with the score as likelihood times impact', () => {
    const rows = tableRows(renderRiskRegister([sample, { ...sample, id: 'RISK-FEE-02', likelihood: 2, impact: 3 }]));
    expect(rows).toEqual([
      '| RISK-FEE-01 | Fee halves round differently | 3 | 2 | 6 | Fee quote parity | qa | open |',
      '| RISK-FEE-02 | Fee halves round differently | 2 | 3 | 6 | Fee quote parity | qa | open |',
    ]);
  });

  it('has the agreed columns', () => {
    expect(renderRiskRegister([sample])).toContain(
      '| ID | Risk | Likelihood | Impact | Score (L×I) | Detection | Stage | Status |',
    );
  });

  it('escapes pipes and flattens line breaks so a cell cannot break the table', () => {
    const [row] = tableRows(renderRiskRegister([{ ...sample, title: 'a | b', detection: 'line one\nline two' }]));
    expect(row).toBe('| RISK-FEE-01 | a \\| b | 3 | 2 | 6 | line one line two | qa | open |');
  });

  it('matches the committed risk-register.md', () => {
    const committed = readFileSync('../docs/quality/risk-register.md', 'utf8');
    expect(renderRiskRegister(loadRisks())).toBe(committed);
  });
});
