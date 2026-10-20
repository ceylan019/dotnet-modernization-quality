import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { k6Evidence } from '../src/gate/k6-evidence';
import { BUDGETS, lighthouseEvidence, summarizeDirectory, summarizeReports } from '../src/gate/lighthouse-evidence';

function k6Summary(count: number, p95: number, durationOk: boolean, failedOk: boolean) {
  return {
    metrics: {
      http_reqs: { values: { count } },
      http_req_duration: { values: { 'p(95)': p95 }, thresholds: { 'p(95)<500': { ok: durationOk } } },
      http_req_failed: { values: { rate: 0 }, thresholds: { 'rate<0.01': { ok: failedOk } } },
    },
  };
}

it('k6 evidence passes when requests were made and thresholds held', () => {
  const e = k6Evidence(k6Summary(143, 17.1, true, true));
  expect(e).toMatchObject({ name: 'perf-k6-journeys', risks: ['RISK-PERF-01'], passed: true, examined: 143 });
});

it('k6 evidence fails when a threshold was breached and names it', () => {
  const e = k6Evidence(k6Summary(100, 900, false, true));
  expect(e.passed).toBe(false);
  expect(e.detail).toContain('p(95)<500');
});

it('k6 evidence refuses a run with no requests', () => {
  const e = k6Evidence(k6Summary(0, 0, true, true));
  expect(e.passed).toBe(false);
  expect(e.examined).toBe(0);
});

it('k6 evidence refuses a summary without evaluated thresholds', () => {
  const e = k6Evidence({ metrics: { http_reqs: { values: { count: 50 } } } });
  expect(e.passed).toBe(false);
  expect(e.detail).toContain('not both evaluated');
});

it('k6 evidence accepts flat metric values', () => {
  const e = k6Evidence({
    metrics: {
      http_reqs: { count: 12 },
      http_req_duration: { 'p(95)': 20, thresholds: { 'p(95)<500': { ok: true } } },
      http_req_failed: { value: 0, thresholds: { 'rate<0.01': { ok: true } } },
    },
  });
  expect(e).toMatchObject({ passed: true, examined: 12 });
});

it('k6 evidence refuses garbage input', () => {
  expect(k6Evidence(null).passed).toBe(false);
  expect(k6Evidence({}).examined).toBe(0);
});

it('lighthouse evidence passes when every page meets the budgets', () => {
  const e = lighthouseEvidence({
    pages: [
      { url: 'http://x/a', performance: 0.8, accessibility: 0.95, bestPractices: 0.9 },
      { url: 'http://x/b', performance: 0.99, accessibility: 1, bestPractices: 1 },
    ],
  });
  expect(e).toMatchObject({ name: 'perf-lighthouse-budgets', risks: ['RISK-PERF-02'], passed: true, examined: 2 });
});

it('lighthouse evidence fails on a missed budget and names the page and category', () => {
  const e = lighthouseEvidence({ pages: [{ url: 'http://x/a', performance: 0.79, accessibility: 1, bestPractices: 1 }] });
  expect(e.passed).toBe(false);
  expect(e.detail).toContain('http://x/a performance 0.79');
  expect(BUDGETS.performance).toBe(0.8);
});

it('lighthouse evidence fails on each category separately', () => {
  expect(lighthouseEvidence({ pages: [{ url: 'u', performance: 1, accessibility: 0.94, bestPractices: 1 }] }).passed).toBe(false);
  expect(lighthouseEvidence({ pages: [{ url: 'u', performance: 1, accessibility: 1, bestPractices: 0.89 }] }).passed).toBe(false);
});

it('lighthouse evidence refuses an audit of no pages', () => {
  const e = lighthouseEvidence({ pages: [] });
  expect(e.passed).toBe(false);
  expect(e.examined).toBe(0);
});

it('lighthouse evidence treats a missing score as a miss', () => {
  const e = lighthouseEvidence({ pages: [{ url: 'u', performance: Number.NaN, accessibility: 1, bestPractices: 1 }] });
  expect(e.passed).toBe(false);
});

it('summarizeReports takes the median of repeated runs per page and skips reports without a URL', () => {
  const report = (url: string, p: number) => ({
    requestedUrl: url,
    categories: { performance: { score: p }, accessibility: { score: 1 }, 'best-practices': { score: 0.9 } },
  });
  const summary = summarizeReports([
    report('http://x/b', 0.5),
    report('http://x/a', 0.6),
    report('http://x/a', 0.9),
    report('http://x/a', 0.7),
    { categories: { performance: { score: 1 } } },
  ]);
  expect(summary.pages.map((p) => p.url)).toEqual(['http://x/a', 'http://x/b']);
  expect(summary.pages[0]).toEqual({ url: 'http://x/a', performance: 0.7, accessibility: 1, bestPractices: 0.9 });
});

it('summarizeDirectory reads only lhr files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lhci-'));
  writeFileSync(
    join(dir, 'lhr-1.json'),
    JSON.stringify({ requestedUrl: 'http://x/a', categories: { performance: { score: 0.8 }, accessibility: { score: 0.9 }, 'best-practices': { score: 1 } } }),
  );
  writeFileSync(join(dir, 'manifest.json'), '[]');
  expect(summarizeDirectory(dir).pages).toHaveLength(1);
});

it('summarizeReports keeps a page with null or missing scores as NaN and the evidence counts it as a miss', () => {
  const summary = summarizeReports([{ requestedUrl: 'http://x/c', categories: { performance: { score: null } } }]);
  expect(summary.pages).toHaveLength(1);
  expect(summary.pages[0]!.performance).toBeNaN();
  expect(summary.pages[0]!.accessibility).toBeNaN();
  expect(lighthouseEvidence(summary)).toMatchObject({ passed: false, examined: 1 });
});
