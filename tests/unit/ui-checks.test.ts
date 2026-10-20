import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import {
  ambiguousLinks, axeSummary, focusIndicatorVisible, headerFindings, headerProblems, leakMarkers, markupProblems,
  seriousOrCritical, tabOrderProblems, tabReport, visualOrder, type FieldFact, type FocusStyle,
} from '../src/ui/checks';
import type { AppDriver } from '../src/drivers/types';
import { legacyFindings, pushEvidence, recordFindings } from '../src/ui/findings';
import { pagePath } from '../src/ui/pages';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('leakMarkers', () => {
  it('finds each marker of a .NET error page', () => {
    const ysod = '[FormatException: Input string was not in a correct format.]\n   at System.Number.StringToNumber()\nStack Trace:';
    expect(leakMarkers(ysod)).toEqual(['Stack Trace', '   at ', 'System.', 'Exception']);
  });

  it('finds nothing in a plain error message', () => {
    expect(leakMarkers('{"errors":[{"message":"Syntax error at line 1"}]}')).toEqual([]);
  });

  it('needs three spaces before "at"', () => {
    expect(leakMarkers('look  at this')).toEqual([]);
  });
});

describe('headers', () => {
  const good = {
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'",
    'referrer-policy': 'no-referrer',
    'content-type': 'text/html',
  };

  it('keeps only the checked headers, null when absent', () => {
    expect(headerFindings({ 'X-AspNet-Version': '4.0.30319', date: 'today' })).toEqual({
      'x-content-type-options': null,
      'content-security-policy': null,
      'referrer-policy': null,
      'x-aspnet-version': '4.0.30319',
      'x-powered-by': null,
    });
  });

  it('accepts a response with every required header and no version header', () => {
    expect(headerProblems(headerFindings(good))).toEqual([]);
  });

  it('reports a missing or wrong nosniff, a missing or blank policy and each version header', () => {
    const problems = headerProblems(headerFindings({
      ...good, 'x-content-type-options': 'sniff', 'content-security-policy': ' ', 'x-powered-by': 'ASP.NET', 'x-aspnet-version': '4.0',
    }));
    expect(problems).toEqual([
      'x-content-type-options is "sniff", expected "nosniff"',
      'content-security-policy is missing',
      'x-aspnet-version is present ("4.0")',
      'x-powered-by is present ("ASP.NET")',
    ]);
    expect(headerProblems(headerFindings({}))).toEqual([
      'x-content-type-options is missing, expected "nosniff"', 'content-security-policy is missing', 'referrer-policy is missing',
    ]);
  });
});

describe('ambiguousLinks', () => {
  it('accepts repeated names with one target and distinct names', () => {
    expect(ambiguousLinks([
      { name: 'Search', target: '/a' }, { name: 'Search', target: '/a' }, { name: 'Apply', target: '/b' },
    ])).toEqual([]);
  });

  it('reports a name shared by different targets, ignoring case and spacing', () => {
    expect(ambiguousLinks([
      { name: 'View', target: '/d?ref=2' }, { name: ' view ', target: '/d?ref=1' }, { name: 'Search', target: '/s' },
    ])).toEqual([{ name: 'View', targets: ['/d?ref=1', '/d?ref=2'] }]);
  });
});

const box = (x: number, y: number, width = 100, height = 20) => ({ x, y, width, height });
const plain: FocusStyle = {
  outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', boxShadow: 'none',
  borderColor: 'rgb(118, 118, 118)', borderWidth: '1px', backgroundColor: 'rgb(255, 255, 255)',
};

describe('visualOrder', () => {
  it('reads top to bottom, then left to right on one line', () => {
    // Two fields side by side on the first line (one 4 px lower), one below.
    expect(visualOrder([box(0, 60), box(200, 4), box(0, 0)])).toEqual([2, 1, 0]);
  });

  it('puts a box below another after it even when it is further left', () => {
    expect(visualOrder([box(300, 0), box(0, 40)])).toEqual([0, 1]);
  });
});

describe('focusIndicatorVisible', () => {
  it('accepts the browser focus ring', () => {
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: 'auto', outlineWidth: '1px', outlineColor: 'rgb(0, 95, 204)' })).toBe(true);
  });

  it('rejects focus that changes nothing, a zero width or transparent outline', () => {
    expect(focusIndicatorVisible(plain, plain)).toBe(false);
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: 'solid', outlineWidth: '0px' })).toBe(false);
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgba(0, 0, 0, 0)' })).toBe(false);
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'transparent' })).toBe(false);
  });

  it('accepts a new shadow, border or background', () => {
    expect(focusIndicatorVisible(plain, { ...plain, boxShadow: 'rgb(0, 0, 255) 0px 0px 0px 3px' })).toBe(true);
    expect(focusIndicatorVisible(plain, { ...plain, borderColor: 'rgb(0, 0, 255)' })).toBe(true);
    expect(focusIndicatorVisible(plain, { ...plain, borderWidth: '2px' })).toBe(true);
    expect(focusIndicatorVisible(plain, { ...plain, backgroundColor: 'rgb(255, 255, 200)' })).toBe(true);
  });
});

describe('tab order', () => {
  const ring: FocusStyle = { ...plain, outlineStyle: 'auto', outlineWidth: '1px' };
  const field = (description: string, y: number): FieldFact => ({ description, box: box(0, y), unfocused: plain });
  const fields = [field('first', 0), field('last', 30), field('submit', 60)];

  it('passes when Tab reaches every field top to bottom with a ring', () => {
    const report = tabReport(fields, [
      { field: null }, { field: 0, focused: ring }, { field: 1, focused: ring }, { field: 2, focused: ring }, { field: null }, { field: 0, focused: ring },
    ]);
    expect(report).toEqual({ fields: ['first', 'last', 'submit'], reached: ['first', 'last', 'submit'], withoutFocusIndicator: [] });
    expect(tabOrderProblems(report)).toEqual([]);
  });

  it('reports a skipped field, a wrong order and a missing ring', () => {
    const report = tabReport(fields, [{ field: 2, focused: ring }, { field: 0, focused: plain }]);
    const problems = tabOrderProblems(report);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toBe('not reached with Tab: last');
    expect(problems[1]).toContain('Tab order differs from visual order');
    expect(problems[2]).toBe('no visible focus indicator: first');
  });

  it('judges the ring by the first visit and tells same named fields apart', () => {
    const twins = [field('input[text] ""', 0), field('input[text] ""', 30)];
    const report = tabReport(twins, [{ field: 1, focused: ring }, { field: 0, focused: plain }, { field: 1, focused: plain }]);
    expect(report.fields).toEqual(['input[text] ""', 'input[text] "" (2)']);
    expect(report.reached).toEqual(['input[text] "" (2)', 'input[text] ""']);
    expect(report.withoutFocusIndicator).toEqual(['input[text] ""']);
  });

  it('fails a page without fields instead of passing it', () => {
    expect(tabOrderProblems(tabReport([], []))).toEqual(['no form fields found']);
  });
});

describe('axe', () => {
  it('summarizes violations by rule and keeps serious and critical ones', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ target: [`li:nth-child(${i + 1})`] }));
    const summary = axeSummary([
      { id: 'label', impact: 'critical', nodes: [{ target: ['#MainContent_Phone'] }] },
      { id: 'color-contrast', impact: 'serious', nodes: many },
      { id: 'region', impact: 'moderate', nodes: [{ target: [['iframe', '#inner']] }] },
      { id: 'odd', nodes: [] },
    ]);
    expect(summary).toEqual([
      { id: 'color-contrast', impact: 'serious', nodes: 7, targets: many.slice(0, 5).map((n) => n.target[0]) },
      { id: 'label', impact: 'critical', nodes: 1, targets: ['#MainContent_Phone'] },
      { id: 'odd', impact: null, nodes: 0, targets: [] },
      { id: 'region', impact: 'moderate', nodes: 1, targets: ['iframe >> #inner'] },
    ]);
    expect(seriousOrCritical(summary).map((v) => v.id)).toEqual(['color-contrast', 'label']);
  });
});

describe('markupProblems', () => {
  const clean = { boldElements: 0, injectedImages: 0, injectedScripts: 0, dialogs: [], missingLiterals: [] };

  it('accepts a name shown as typed', () => {
    expect(markupProblems(clean)).toEqual([]);
  });

  it('reports each sign of a name written as HTML', () => {
    expect(markupProblems({ boldElements: 1, injectedImages: 1, injectedScripts: 1, dialogs: ['x'], missingLiterals: ['<b>Roy</b>'] })).toEqual([
      '1 <b> element(s)', '1 injected <img> element(s)', '1 injected <script> element(s)', 'dialog(s) opened: x', 'not shown as literal text: <b>Roy</b>',
    ]);
  });
});

describe('findings', () => {
  const info = () => ({ annotations: [] as { type: string; description?: string }[] }) as unknown as TestInfo;
  const useEnv = (mode: 'record' | 'compare'): void => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-findings-'));
    Object.assign(process.env, { TARGET: 'legacy', BASE_URL: 'http://localhost:8081', PARITY_MODE: mode, BASELINES_DIR: dir });
  };
  const findings = { suite: 'a11y', caseId: 'search', risks: ['RISK-A11Y-01'], request: { view: 'search' }, actual: { violations: [] } };

  it('records in record mode and reads the recorded findings back', () => {
    useEnv('record');
    const t = info();
    recordFindings(t, loadEnv(), findings);
    expect(t.annotations).toEqual([{ type: 'baseline-recorded', description: 'a11y/search' }]);
    expect(legacyFindings('a11y', 'search', { view: 'search' })).toEqual({ violations: [] });
  });

  it('stores nothing in compare mode', () => {
    useEnv('compare');
    const t = info();
    recordFindings(t, loadEnv(), findings);
    expect(t.annotations).toEqual([]);
    expect(() => legacyFindings('a11y', 'search', { view: 'search' })).toThrow('No legacy baseline for a11y/search');
  });

  it('refuses findings recorded for a different request', () => {
    useEnv('record');
    recordFindings(info(), loadEnv(), findings);
    expect(() => legacyFindings('a11y', 'search', { view: 'apply' })).toThrow('differs from the recorded request');
  });

  it('pushes evidence as name=count', () => {
    const t = info();
    pushEvidence(t, 'fields', 12);
    expect(t.annotations).toEqual([{ type: 'evidence', description: 'fields=12' }]);
  });
});

describe('pagePath', () => {
  const driver = (names: string[]) => ({ pages: names.map((name) => ({ name, path: `/${name}` })) }) as unknown as AppDriver;

  it('returns the path of a named page', () => {
    expect(pagePath(driver(['search', 'apply', 'detail', 'review']), 'detail')).toBe('/detail');
  });

  it('refuses a driver with an extra, a missing or a reordered page', () => {
    for (const names of [['search', 'apply', 'detail', 'review', 'home'], ['search', 'apply', 'detail'], ['apply', 'search', 'detail', 'review']]) {
      expect(() => pagePath(driver(names), 'search')).toThrow('differ from the pages the checks cover');
    }
  });
});
