import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { filterApproved, loadApprovedDifferences, type ApprovedDifference } from '../src/parity/approved-differences';
import type { Difference } from '../src/parity/diff';

const ad = (over: Partial<ApprovedDifference> = {}): ApprovedDifference => ({
  id: 'AD-001', suite: 'ui-detail', caseId: 'detail-roy', path: '$.data.name',
  reason: 'r', approvedBy: 'ceylan019', approvedOn: '2026-11-02', ...over,
});
const diff = (path: string): Difference => ({ path, kind: 'changed', expected: 1, actual: 2 });

function fileWith(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'ad-'));
  const file = join(dir, 'ad.json');
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

it('removes an exact suite, case and path match and reports the id', () => {
  const r = filterApproved([diff('$.data.name')], 'ui-detail', 'detail-roy', [ad()]);
  expect(r).toEqual({ remaining: [], applied: ['AD-001'] });
});

it('keeps a difference when suite, case or path differs', () => {
  const d = [diff('$.data.name')];
  expect(filterApproved(d, 'other', 'detail-roy', [ad()]).remaining).toEqual(d);
  expect(filterApproved(d, 'ui-detail', 'other', [ad()]).remaining).toEqual(d);
  expect(filterApproved(d, 'ui-detail', 'detail-roy', [ad({ path: '$.data.nam' })]).remaining).toEqual(d);
  expect(filterApproved(d, 'ui-detail', 'detail-roy', [ad({ path: '$.data' })]).remaining).toEqual(d);
  expect(filterApproved(d, 'ui-detail', 'detail-roy', [ad({ path: '$.data.name.first' })]).remaining).toEqual(d);
  expect(filterApproved(d, 'ui-detail', 'detail-roy', [ad({ path: '$.data.name2' })]).remaining).toEqual(d);
});

it('applies nothing and reports nothing when the list is empty', () => {
  expect(filterApproved([diff('$.a')], 's', 'c', [])).toEqual({ remaining: [diff('$.a')], applied: [] });
});

it('does not treat a path as a prefix or a regex', () => {
  const approved = [ad({ path: '$.data.na.e' })];
  expect(filterApproved([diff('$.data.name')], 'ui-detail', 'detail-roy', approved).remaining).toHaveLength(1);
  expect(filterApproved([diff('$.data.name.first')], 'ui-detail', 'detail-roy', [ad()]).remaining).toHaveLength(1);
});

it('lets caseId * cover every case of the suite but not other suites', () => {
  const a = [ad({ caseId: '*' })];
  expect(filterApproved([diff('$.data.name')], 'ui-detail', 'anything', a).applied).toEqual(['AD-001']);
  expect(filterApproved([diff('$.data.name')], 'ui-list', 'anything', a).applied).toEqual([]);
});

it('lets * stand for exactly one path segment', () => {
  const a = [ad({ path: '$.data.items.*.name' })];
  const run = (p: string) => filterApproved([diff(p)], 'ui-detail', 'detail-roy', a);
  expect(run('$.data.items[0].name').applied).toEqual(['AD-001']);
  expect(run('$.data.items[12].name').applied).toEqual(['AD-001']);
  expect(run('$.data.items.x.name').applied).toEqual(['AD-001']);
  expect(run('$.data.items.name').remaining).toHaveLength(1);
  expect(run('$.data.items[0].a.name').remaining).toHaveLength(1);
  expect(run('$.data.items[0].other').remaining).toHaveLength(1);
});

it('accepts [*] as a wildcard segment too', () => {
  const a = [ad({ path: '$.data.items[*].name' })];
  expect(filterApproved([diff('$.data.items[3].name')], 'ui-detail', 'detail-roy', a).applied).toEqual(['AD-001']);
});

it('removes only matching differences and lists each applied id once', () => {
  const a = [ad(), ad({ id: 'AD-002', path: '$.data.status' })];
  const r = filterApproved([diff('$.data.name'), diff('$.data.name'), diff('$.data.fee'), diff('$.data.status')], 'ui-detail', 'detail-roy', a);
  expect(r.remaining).toEqual([diff('$.data.fee')]);
  expect(r.applied).toEqual(['AD-001', 'AD-002']);
});

it('does not apply an id for an entry that matched nothing', () => {
  const r = filterApproved([diff('$.x')], 'ui-detail', 'detail-roy', [ad(), ad({ id: 'AD-002', path: '$.x' })]);
  expect(r.applied).toEqual(['AD-002']);
});

it('matches schema paths literally', () => {
  const a = [ad({ path: 'schema:Permit.status' })];
  expect(filterApproved([diff('schema:Permit.status')], 'ui-detail', 'detail-roy', a).applied).toEqual(['AD-001']);
  expect(filterApproved([diff('schema:Permit.fee')], 'ui-detail', 'detail-roy', a).applied).toEqual([]);
});

it('loads a valid file including the optional defect', () => {
  const entry = { ...ad(), defect: 'DEF-004' };
  expect(loadApprovedDifferences(fileWith([entry]))).toEqual([entry]);
});

it('loads an empty list', () => {
  expect(loadApprovedDifferences(fileWith([]))).toEqual([]);
});

it('loads the committed list by default', () => {
  expect(loadApprovedDifferences()).toEqual([]);
});

it('rejects an empty or blank approvedBy', () => {
  expect(() => loadApprovedDifferences(fileWith([ad({ approvedBy: '' })]))).toThrow(/approvedBy/);
  expect(() => loadApprovedDifferences(fileWith([ad({ approvedBy: '   ' })]))).toThrow(/approvedBy/);
});

it('rejects missing fields, unknown fields, empty reason and bad dates', () => {
  const { reason: _omit, ...noReason } = ad();
  void _omit;
  expect(() => loadApprovedDifferences(fileWith([noReason]))).toThrow();
  expect(() => loadApprovedDifferences(fileWith([{ ...ad(), extra: 1 }]))).toThrow();
  expect(() => loadApprovedDifferences(fileWith([ad({ reason: '' })]))).toThrow(/reason/);
  expect(() => loadApprovedDifferences(fileWith([ad({ approvedOn: 'tomorrow' })]))).toThrow(/approvedOn/);
  expect(() => loadApprovedDifferences(fileWith([ad({ id: '' })]))).toThrow(/id/);
  expect(() => loadApprovedDifferences(fileWith([ad({ suite: '' })]))).toThrow(/suite/);
  expect(() => loadApprovedDifferences(fileWith([ad({ caseId: '' })]))).toThrow(/caseId/);
  expect(() => loadApprovedDifferences(fileWith([ad({ path: '' })]))).toThrow(/path/);
});

it('rejects a non-array file and duplicate ids', () => {
  expect(() => loadApprovedDifferences(fileWith({}))).toThrow();
  expect(() => loadApprovedDifferences(fileWith([ad(), ad()]))).toThrow(/duplicate/i);
});

it('names the file when it cannot be read or parsed', () => {
  expect(() => loadApprovedDifferences('/nonexistent/ad.json')).toThrow(/ad\.json/);
  expect(() => loadApprovedDifferences(fileWith('not json'))).toThrow(/ad\.json/);
});

it('requires approvedOn to be exactly a date', () => {
  for (const bad of ['x2026-11-02', '2026-11-02x', '2026-11-02T00:00:00Z', '02-11-2026']) {
    expect(() => loadApprovedDifferences(fileWith([ad({ approvedOn: bad })]))).toThrow(/approvedOn/);
  }
});

it('rejects a reason that is only whitespace', () => {
  expect(() => loadApprovedDifferences(fileWith([ad({ reason: '   ' })]))).toThrow(/reason/);
});

it('explains why a file is rejected, with the path and message of every problem', () => {
  const file = fileWith([ad({ approvedBy: '' }), ad({ id: 'AD-002', reason: '' })]);
  expect(() => loadApprovedDifferences(file)).toThrow(
    new RegExp(`^Invalid approved differences in ${file.replace(/[.*+?^${}()|[\\\]\\]/g, '\\$&')}: 0\\.approvedBy: .+; 1\\.reason: .+$`),
  );
});

it('keeps the underlying error as the cause when the file is unreadable', () => {
  try {
    loadApprovedDifferences('/nonexistent/ad.json');
    expect.unreachable();
  } catch (e) {
    expect((e as Error).message).toMatch(/^Cannot read approved differences from \/nonexistent\/ad\.json: /);
    expect((e as Error).cause).toBeInstanceOf(Error);
  }
});
