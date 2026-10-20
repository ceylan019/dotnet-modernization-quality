import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { afterEach, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import type { AppDriver, ApplyForm } from '../src/drivers/types';
import {
  affectedNodes, ambiguousLinks, axeSummary, focusIndicatorVisible, headerFindings, headerProblems, leakMarkers,
  markupProblems, seriousOrCritical, tabOrderProblems, tabReport, visualOrder, type AxeViolation, type FieldFact,
  type FocusStyle,
} from '../src/ui/checks';
import { legacyFindings, pushEvidence, recordFindings } from '../src/ui/findings';
import {
  APPLY_FORM_FIELDS, APPLY_FORM_FIELDS_COMPLETE, PAGE_NAMES, pagePath, PREVIEW_FORM, showPage, VIEWS,
} from '../src/ui/pages';
import { newApplicationVolatile, uiTags } from '../src/ui/ui-case';

// Flat tests (no describe): Stryker maps coverage per test more precisely that way.

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

// ---- leakMarkers ----

it('leakMarkers: finds each marker of a .NET error page', () => {
  const ysod = '[FormatException: Input string was not in a correct format.]\n   at System.Number.StringToNumber()\nStack Trace:';
  expect(leakMarkers(ysod)).toEqual(['Stack Trace', '   at ', 'System.', 'Exception']);
});

it('leakMarkers: finds nothing in a plain error message', () => {
  expect(leakMarkers('{"errors":[{"message":"Syntax error at line 1"}]}')).toEqual([]);
});

it('leakMarkers: needs three spaces before "at"', () => {
  expect(leakMarkers('look  at this')).toEqual([]);
});

// ---- headers ----

const goodHeaders = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'self'",
  'referrer-policy': 'no-referrer',
  'content-type': 'text/html',
};

it('headers: keeps only the checked headers, matched in any case, null when absent', () => {
  expect(headerFindings({ 'X-AspNet-Version': '4.0.30319', date: 'today' })).toEqual({
    'x-content-type-options': null,
    'content-security-policy': null,
    'referrer-policy': null,
    'x-aspnet-version': '4.0.30319',
    'x-powered-by': null,
  });
});

it('headers: accepts every required header and no version header', () => {
  expect(headerProblems(headerFindings(goodHeaders))).toEqual([]);
});

it('headers: accepts nosniff in any case with spaces around it', () => {
  expect(headerProblems(headerFindings({ ...goodHeaders, 'x-content-type-options': ' NoSniff ' }))).toEqual([]);
});

it('headers: reports a wrong nosniff, a blank policy and each version header', () => {
  expect(headerProblems(headerFindings({
    ...goodHeaders, 'x-content-type-options': 'sniff', 'content-security-policy': ' ', 'x-powered-by': 'ASP.NET', 'x-aspnet-version': '4.0',
  }))).toEqual([
    'x-content-type-options is "sniff", expected "nosniff"',
    'content-security-policy is missing',
    'x-aspnet-version is present ("4.0")',
    'x-powered-by is present ("ASP.NET")',
  ]);
});

it('headers: reports every missing header, whether null or not recorded at all', () => {
  const missing = ['x-content-type-options is missing, expected "nosniff"', 'content-security-policy is missing', 'referrer-policy is missing'];
  expect(headerProblems(headerFindings({}))).toEqual(missing);
  expect(headerProblems({})).toEqual(missing);
  expect(headerProblems({ ...headerFindings(goodHeaders), 'referrer-policy': ' ' })).toEqual(['referrer-policy is missing']);
});

// ---- ambiguousLinks ----

it('ambiguousLinks: accepts repeated names with one target and distinct names', () => {
  expect(ambiguousLinks([
    { name: 'Search', target: '/a' }, { name: 'Search', target: '/a' }, { name: 'Apply', target: '/b' },
  ])).toEqual([]);
});

it('ambiguousLinks: reports a name shared by different targets, ignoring case and spacing', () => {
  expect(ambiguousLinks([
    { name: 'View  this', target: '/d?ref=2' }, { name: ' view this ', target: '/d?ref=1' }, { name: 'Search', target: '/s' },
  ])).toEqual([{ name: 'View this', targets: ['/d?ref=1', '/d?ref=2'] }]);
});

it('ambiguousLinks: lists ambiguous names alphabetically', () => {
  expect(ambiguousLinks([
    { name: 'Next', target: '/2' }, { name: 'Next', target: '/3' }, { name: 'Edit', target: '/e1' }, { name: 'Edit', target: '/e2' },
  ]).map((a) => a.name)).toEqual(['Edit', 'Next']);
});

// ---- visualOrder ----

const box = (x: number, y: number, width = 100, height = 20) => ({ x, y, width, height });

it('visualOrder: reads top to bottom, then left to right on one line', () => {
  // Two fields side by side on the first line (one 4 px lower), one below.
  expect(visualOrder([box(0, 60), box(200, 4), box(0, 0)])).toEqual([2, 1, 0]);
});

it('visualOrder: puts a box on a lower line after one on a higher line, whatever x', () => {
  expect(visualOrder([box(300, 0), box(0, 40)])).toEqual([0, 1]);
  expect(visualOrder([box(0, 40), box(300, 0)])).toEqual([1, 0]);
});

it('visualOrder: three lines of two boxes each, given in reverse', () => {
  const boxes = [box(200, 80), box(0, 80), box(200, 40), box(0, 40), box(200, 0), box(0, 0)];
  expect(visualOrder(boxes)).toEqual([5, 4, 3, 2, 1, 0]);
});

it('visualOrder: a box overlapping the line by exactly half its height joins it', () => {
  // The second box starts 10 px into a 20 px line: 10 px of overlap, half its height.
  expect(visualOrder([box(200, 0), box(0, 10)])).toEqual([1, 0]);
  // 11 px lower it overlaps 9 px and starts the next line.
  expect(visualOrder([box(200, 0), box(0, 11)])).toEqual([0, 1]);
});

it('visualOrder: mixed heights are grouped by line, so the order is the same for any input order', () => {
  // A tall textarea in the middle column spans two short inputs: one on the right at its top,
  // one on the left near its bottom. Pairwise rules would cycle; lines do not.
  const tall = box(100, 0, 100, 100);
  const topRight = box(200, 0);
  const bottomLeft = box(0, 80);
  expect(visualOrder([tall, topRight, bottomLeft])).toEqual([2, 0, 1]);
  expect(visualOrder([bottomLeft, topRight, tall])).toEqual([0, 2, 1]);
});

it('visualOrder: the line grows with a tall member, and a small box joins on half of its own height', () => {
  // Line from 0 to 20, then a 60 px box from 10 (10 px overlap: half the line height) extends
  // it to 70; a box at 60 overlaps only the extended line.
  expect(visualOrder([box(300, 0), box(200, 10, 100, 60), box(0, 60)])).toEqual([2, 1, 0]);
  // A 4 px box overlapping a 40 px line by 2 px joins (half of its own height).
  expect(visualOrder([box(200, 0, 100, 40), box(0, 38, 100, 4)])).toEqual([1, 0]);
  // The same tall box below the top of the page: the line height is bottom minus top.
  expect(visualOrder([box(300, 100), box(200, 110, 100, 60)])).toEqual([1, 0]);
});

// ---- focusIndicatorVisible ----

const plain: FocusStyle = {
  outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', boxShadow: 'none',
  borderColor: 'rgb(118, 118, 118)', borderWidth: '1px', backgroundColor: 'rgb(255, 255, 255)',
};
const ring: FocusStyle = { ...plain, outlineStyle: 'auto', outlineWidth: '1px', outlineColor: 'rgb(0, 95, 204)' };

it('focus: accepts the browser focus ring', () => {
  expect(focusIndicatorVisible(plain, ring)).toBe(true);
});

it('focus: rejects focus that changes nothing, or a zero width or transparent outline', () => {
  expect(focusIndicatorVisible(plain, plain)).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineWidth: '0px' })).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineColor: 'rgba(0, 0, 0, 0)' })).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineColor: 'transparent' })).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineColor: 'rgba(0,0,0,0)' })).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineColor: 'rgba(0, 0, 0, 0.0)' })).toBe(false);
  expect(focusIndicatorVisible(plain, { ...ring, outlineStyle: 'none' })).toBe(false);
});

it('focus: a half transparent outline still shows', () => {
  expect(focusIndicatorVisible(plain, { ...ring, outlineColor: 'rgba(0, 0, 0, 0.5)' })).toBe(true);
});

it('focus: an outline that is always there is no indicator, a changed one is', () => {
  expect(focusIndicatorVisible(ring, ring)).toBe(false);
  expect(focusIndicatorVisible(ring, { ...ring, outlineStyle: 'solid' })).toBe(true);
  expect(focusIndicatorVisible(ring, { ...ring, outlineWidth: '3px' })).toBe(true);
  expect(focusIndicatorVisible(ring, { ...ring, outlineColor: 'rgb(255, 0, 0)' })).toBe(true);
  // A transparent outline before focus counts as none.
  expect(focusIndicatorVisible({ ...ring, outlineColor: 'transparent' }, ring)).toBe(true);
});

it('focus: accepts a new shadow, border or background', () => {
  expect(focusIndicatorVisible(plain, { ...plain, boxShadow: 'rgb(0, 0, 255) 0px 0px 0px 3px' })).toBe(true);
  expect(focusIndicatorVisible(plain, { ...plain, borderColor: 'rgb(0, 0, 255)' })).toBe(true);
  expect(focusIndicatorVisible(plain, { ...plain, borderWidth: '2px' })).toBe(true);
  expect(focusIndicatorVisible(plain, { ...plain, backgroundColor: 'rgb(255, 255, 200)' })).toBe(true);
});

it('focus: a shadow that stays the same or goes away is no indicator', () => {
  const shadowed = { ...plain, boxShadow: 'rgb(0, 0, 0) 0px 1px 2px 0px' };
  expect(focusIndicatorVisible(shadowed, shadowed)).toBe(false);
  expect(focusIndicatorVisible(shadowed, plain)).toBe(false);
});

// ---- tab order ----

const field = (description: string, y: number): FieldFact => ({ description, box: box(0, y), unfocused: plain });
const threeFields = [field('first', 0), field('last', 30), field('submit', 60)];

it('tab order: passes when Tab reaches every field top to bottom with a ring', () => {
  const report = tabReport(threeFields, [
    { field: null }, { field: 0, focused: ring }, { field: 1, focused: ring }, { field: 2, focused: ring }, { field: null }, { field: 0, focused: ring },
  ]);
  expect(report).toEqual({ fields: ['first', 'last', 'submit'], reached: ['first', 'last', 'submit'], withoutFocusIndicator: [] });
  expect(tabOrderProblems(report)).toEqual([]);
});

it('tab order: reports a skipped field, a wrong order and a missing ring', () => {
  const report = tabReport(threeFields, [{ field: 2, focused: ring }, { field: 0, focused: plain }]);
  expect(tabOrderProblems(report)).toEqual([
    'not reached with Tab: last',
    'Tab order differs from visual order:\n  tab:    submit, first\n  visual: first, submit',
    'no visible focus indicator: first',
  ]);
});

it('tab order: one swapped pair among fields in place is reported', () => {
  const report = tabReport(threeFields, [{ field: 1, focused: ring }, { field: 0, focused: ring }, { field: 2, focused: ring }]);
  expect(tabOrderProblems(report)).toEqual(['Tab order differs from visual order:\n  tab:    last, first, submit\n  visual: first, last, submit']);
});

it('tab order: lists every missed field and every field without a ring', () => {
  const four = [...threeFields, field('cancel', 90)];
  const report = tabReport(four, [{ field: 0, focused: plain }, { field: 3, focused: plain }]);
  expect(tabOrderProblems(report)).toEqual([
    'not reached with Tab: last, submit',
    'no visible focus indicator: first, cancel',
  ]);
});

it('tab order: judges the ring by the first visit and tells same named fields apart', () => {
  const twins = [field('input[text] ""', 0), field('input[text] ""', 30), field('input[text] ""', 60)];
  const report = tabReport(twins, [{ field: 1, focused: ring }, { field: 0, focused: plain }, { field: 1, focused: plain }, { field: 2 }]);
  expect(report.fields).toEqual(['input[text] ""', 'input[text] "" (2)', 'input[text] "" (3)']);
  expect(report.reached).toEqual(['input[text] "" (2)', 'input[text] ""', 'input[text] "" (3)']);
  expect(report.withoutFocusIndicator).toEqual(['input[text] ""', 'input[text] "" (3)']);
});

it('tab order: fails a page without fields instead of passing it', () => {
  expect(tabOrderProblems(tabReport([], []))).toEqual(['no form fields found']);
});

// ---- axe ----

it('axe: summarizes violations by rule with the first five targets, and keeps serious and critical ones', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ target: [`li:nth-child(${i + 1})`] }));
  const summary = axeSummary([
    { id: 'label', impact: 'critical', nodes: [{ target: ['#MainContent_Phone'] }] },
    { id: 'color-contrast', impact: 'serious', nodes: many },
    { id: 'region', impact: 'moderate', nodes: [{ target: [['iframe', '#inner']] }] },
    { id: 'odd', nodes: [{ target: 'html' }] },
  ]);
  expect(summary).toEqual([
    { id: 'color-contrast', impact: 'serious', nodes: 7, targets: many.slice(0, 5).map((n) => n.target[0]) },
    { id: 'label', impact: 'critical', nodes: 1, targets: ['#MainContent_Phone'] },
    { id: 'odd', impact: null, nodes: 1, targets: ['html'] },
    { id: 'region', impact: 'moderate', nodes: 1, targets: ['iframe >> #inner'] },
  ]);
  expect(seriousOrCritical(summary).map((v) => v.id)).toEqual(['color-contrast', 'label']);
  expect(affectedNodes(summary)).toBe(10);
});

it('axe: no violations affect no elements', () => {
  const none: AxeViolation[] = [];
  expect(affectedNodes(none)).toBe(0);
  expect(seriousOrCritical(none)).toEqual([]);
});

// ---- markupProblems ----

it('markup: accepts a name shown as typed', () => {
  expect(markupProblems({ boldElements: 0, injectedImages: 0, injectedScripts: 0, dialogs: [], missingLiterals: [] })).toEqual([]);
});

it('markup: reports each sign of a name written as HTML', () => {
  expect(markupProblems({
    boldElements: 1, injectedImages: 2, injectedScripts: 3, dialogs: ['x', 'y'], missingLiterals: ['<b>Roy</b>', '"><img src=x>'],
  })).toEqual([
    '1 <b> element(s)',
    '2 injected <img> element(s)',
    '3 injected <script> element(s)',
    'dialog(s) opened: x, y',
    'not shown as literal text: <b>Roy</b>, "><img src=x>',
  ]);
});

// ---- findings ----

const fakeInfo = () => ({ annotations: [] as { type: string; description?: string }[] }) as unknown as TestInfo;

function useEnv(mode: 'record' | 'compare'): void {
  const dir = mkdtempSync(join(tmpdir(), 'ui-findings-'));
  Object.assign(process.env, { TARGET: 'legacy', BASE_URL: 'http://localhost:8081', PARITY_MODE: mode, BASELINES_DIR: dir });
}

const searchFindings = { suite: 'a11y', caseId: 'search', risks: ['RISK-A11Y-01'], request: { view: 'search' }, actual: { violations: [] } };

it('findings: records in record mode and reads the recorded findings back', () => {
  useEnv('record');
  const t = fakeInfo();
  recordFindings(t, loadEnv(), searchFindings);
  expect(t.annotations).toEqual([{ type: 'baseline-recorded', description: 'a11y/search' }]);
  expect(legacyFindings('a11y', 'search', { view: 'search' })).toEqual({ violations: [] });
});

it('findings: stores nothing in compare mode', () => {
  useEnv('compare');
  const t = fakeInfo();
  recordFindings(t, loadEnv(), searchFindings);
  expect(t.annotations).toEqual([]);
  expect(() => legacyFindings('a11y', 'search', { view: 'search' })).toThrow(/^No legacy baseline for a11y\/search$/);
});

it('findings: refuses findings recorded for a different request', () => {
  useEnv('record');
  recordFindings(fakeInfo(), loadEnv(), searchFindings);
  expect(() => legacyFindings('a11y', 'search', { view: 'apply', extra: 1 })).toThrow(
    /^Request for a11y\/search differs from the recorded request, re-record the baseline: \$request\.view, \$request\.extra$/,
  );
});

it('findings: pushes evidence as name=count', () => {
  const t = fakeInfo();
  pushEvidence(t, 'fields', 12);
  expect(t.annotations).toEqual([{ type: 'evidence', description: 'fields=12' }]);
});

// ---- pages ----

const driverWith = (names: readonly string[]) => ({ pages: names.map((name) => ({ name, path: `/${name}` })) }) as unknown as AppDriver;

it('pages: the four page names, in order', () => {
  expect(PAGE_NAMES).toEqual(['search', 'apply', 'detail', 'review']);
});

it('pages: pagePath returns the path of the named page', () => {
  const app = driverWith(PAGE_NAMES);
  expect(PAGE_NAMES.map((name) => pagePath(app, name))).toEqual(['/search', '/apply', '/detail', '/review']);
});

it('pages: pagePath refuses a driver with an extra, a missing or a reordered page', () => {
  expect(() => pagePath(driverWith(['search', 'apply', 'detail', 'review', 'home']), 'search')).toThrow(
    /^The driver pages \(search, apply, detail, review, home\) differ from the pages the checks cover \(search, apply, detail, review\)$/,
  );
  for (const names of [['search', 'apply', 'detail'], ['apply', 'search', 'detail', 'review']]) {
    expect(() => pagePath(driverWith(names), 'search')).toThrow('differ from the pages the checks cover');
  }
});

it('pages: the ApplyForm field list is complete', () => {
  expect(APPLY_FORM_FIELDS).toHaveLength(10);
  expect(APPLY_FORM_FIELDS_COMPLETE).toBe(true);
});

it('pages: the preview form is a complete, valid application', () => {
  const expected: ApplyForm = {
    firstName: 'Avery', lastName: 'Lindqvist', email: 'avery.lindqvist@example.test', permitType: 'RENO',
    siteAddress: '1 Test Street', areaSqM: '10.70',
  };
  expect(PREVIEW_FORM).toEqual(expected);
});

interface Calls { goto: string[]; search: string[]; open: number; fill: unknown[]; preview: number }

function fakes(opts: { status?: number | null; fee?: string; messages?: string[] } = {}) {
  const calls: Calls = { goto: [], search: [], open: 0, fill: [], preview: 0 };
  const status = opts.status === undefined ? 200 : opts.status;
  const page = {
    goto: async (path: string) => {
      calls.goto.push(path);
      return status === null ? null : { ok: () => status < 400, status: () => status };
    },
  } as unknown as Page;
  const app = {
    ...driverWith(PAGE_NAMES),
    search: { search: async (text: string) => { calls.search.push(text); } },
    apply: {
      open: async () => { calls.open++; },
      fill: async (form: unknown) => { calls.fill.push(form); },
      preview: async () => { calls.preview++; return { fee: opts.fee ?? '$1.00', hst: '', total: '', dueDate: '' }; },
      validationMessages: async () => opts.messages ?? ['First name is required'],
    },
  } as unknown as AppDriver;
  return { calls, page, app };
}

it('pages: showPage opens search and fills the grid with an empty search', async () => {
  const { calls, page, app } = fakes();
  await showPage(app, page, 'search');
  expect(calls.goto).toEqual(['/search']);
  expect(calls.search).toEqual(['']);
});

it('pages: showPage opens other pages without searching', async () => {
  const { calls, page, app } = fakes();
  await showPage(app, page, 'apply');
  expect(calls.goto).toEqual(['/apply']);
  expect(calls.search).toEqual([]);
});

it('pages: showPage fails on an error status or no response', async () => {
  const failing = fakes({ status: 500 });
  await expect(showPage(failing.app, failing.page, 'detail')).rejects.toThrow(/^Page detail answered HTTP 500$/);
  const none = fakes({ status: null });
  await expect(showPage(none.app, none.page, 'review')).rejects.toThrow(/^Page review answered HTTP without a response$/);
});

it('pages: the views are the four pages and the two Apply states', async () => {
  expect(VIEWS.map((v) => v.name)).toEqual(['search', 'apply', 'detail', 'review', 'apply-preview', 'apply-errors']);
  const { calls, page, app } = fakes();
  await VIEWS[2]!.show(app, page);
  expect(calls.goto).toEqual(['/detail']);
});

it('pages: the apply-preview view previews the preview form and needs an estimate', async () => {
  const view = VIEWS.find((v) => v.name === 'apply-preview')!;
  const ok = fakes();
  await view.show(ok.app, ok.page);
  expect(ok.calls).toMatchObject({ open: 1, fill: [PREVIEW_FORM], preview: 1 });
  const none = fakes({ fee: '' });
  await expect(view.show(none.app, none.page)).rejects.toThrow(/^The Apply page showed no fee estimate for a valid form$/);
});

it('pages: the apply-errors view previews an empty form and needs messages', async () => {
  const view = VIEWS.find((v) => v.name === 'apply-errors')!;
  const ok = fakes();
  await view.show(ok.app, ok.page);
  expect(ok.calls).toMatchObject({ open: 1, fill: [], preview: 1 });
  const none = fakes({ messages: [] });
  await expect(view.show(none.app, none.page)).rejects.toThrow(/^The Apply page showed no validation messages for an empty form$/);
});

// ---- ui-case ----

it('ui-case: tags and volatile paths of a new application', () => {
  expect(uiTags(['RISK-UI-01', 'RISK-UI-02'])).toEqual(['@ui', '@parity', '@RISK-UI-01', '@RISK-UI-02']);
  expect(newApplicationVolatile()).toEqual({
    'application.referenceNumber': 'referenceNumber',
    'application.submittedAt': 'timestamp',
    'application.lastUpdatedAt': 'timestamp',
    'application.history[*].changedAt': 'timestamp',
  });
  expect(Object.keys(newApplicationVolatile('changeStatus'))[0]).toBe('changeStatus.referenceNumber');
});
