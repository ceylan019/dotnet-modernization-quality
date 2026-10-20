import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadForeignKeys, loadMapping, type ForeignKey, type TableMap } from '../src/migration/mapping';
import type { SqlSide } from '../src/migration/sources';
import { evidenceFor, type OrphanCount } from '../src/migration/evidence';
import { countOrphans, validateMigration } from '../src/migration/validate';

type Row = (string | null)[];

function fake(dialect: SqlSide['dialect'], tables: Record<string, Row[]>, orphans = '0', childRows = '5'): SqlSide {
  return {
    dialect,
    async query<T>(text: string): Promise<T[]> {
      if (text.includes('LEFT JOIN')) return [{ n: orphans }] as T[];
      if (text.includes('COUNT(*)')) return [{ n: childRows }] as T[];
      const m = /FROM\s+(\S+)\s*$/.exec(text);
      const name = m![1]!.replace(/[[\]"]/g, '');
      const rows = tables[name];
      if (!rows) throw new Error(`unknown table ${name}`);
      return rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))) as T[];
    },
  };
}

const mapping: TableMap[] = [
  {
    source: 'dbo.Items',
    target: 'items',
    key: ['Id'],
    columns: [
      { source: 'Id', target: 'id', kind: 'int' },
      { source: 'Price', target: 'price', kind: 'money' },
      { source: 'Area', target: 'area', kind: 'decimal' },
      { source: 'Name', target: 'name', kind: 'text' },
      { source: 'Note', target: 'note', kind: 'text' },
      { source: 'Day', target: 'day', kind: 'date' },
      { source: 'At', target: 'at', kind: 'datetime' },
      { source: 'Flag', target: 'flag', kind: 'bool' },
    ],
  },
];

const base = (): Row[] => [
  ['1', '88.1234', '12.50', 'Trail ', null, '2026-01-02', '2026-03-08 02:30:00.000', '1'],
  ['2', '10.0000', '3.25', 'José', '', '2026-02-03', '2026-03-09 10:00:00.003', '0'],
  ['3', '0.5000', '1.00', 'Plain', 'x', '2026-04-05', '2026-04-05 23:59:59.997', '1'],
];

async function run(target: Row[], probes: Record<string, (string | number)[][]> = {}, srcRows = base()) {
  return validateMigration(fake('mssql', { 'dbo.Items': srcRows }), fake('postgres', { items: target }), mapping, probes);
}

function failing(report: Awaited<ReturnType<typeof run>>): string[] {
  return report.tables.flatMap((t) => t.columns.filter((c) => !c.ok).map((c) => `${c.column}:${c.check}`));
}

it('passes identical data, ignoring decimal scale and timestamp precision differences', async () => {
  const target = base().map((r) => [...r]);
  target[0]![1] = '88.1234';
  target[1]![1] = '10';
  target[0]![6] = '2026-03-08 02:30:00';
  target[1]![6] = '2026-03-09 10:00:00.003000';
  target[2]![6] = '2026-04-05 23:59:59.997000';
  const report = await run(target);
  expect(failing(report)).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.examinedRows).toBe(3);
  expect(report.tables[0]!.sourceRows).toBe(3);
});

it('fails on a changed money value', async () => {
  const t = base();
  t[0]![1] = '88.1200';
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toContain('Price:sum');
});

it('fails on a dropped row', async () => {
  const report = await run(base().slice(0, 2));
  expect(report.ok).toBe(false);
  expect(report.tables[0]!.targetRows).toBe(2);
});

it('fails on a trailing space change', async () => {
  const t = base();
  t[0]![3] = 'Trail';
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toEqual(expect.arrayContaining(['Name:length', 'Name:sha256']));
});

it('fails on empty string versus NULL', async () => {
  const t = base();
  t[1]![4] = null;
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toEqual(expect.arrayContaining(['Note:nonNull', 'Note:sha256']));
});

it('fails on a changed date range, a swapped text value and a flipped bool', async () => {
  const t = base();
  t[2]![5] = '2026-04-06';
  t[0]![3] = 'Trial ';
  t[1]![7] = '1';
  const report = await run(t);
  expect(failing(report)).toEqual(expect.arrayContaining(['Day:minMax', 'Name:sha256', 'Flag:sum']));
});

it('hashes by key order, so row order does not matter but moving a value between keys does', async () => {
  expect((await run([...base()].reverse())).ok).toBe(true);
  const t = base();
  [t[0]![3], t[2]![3]] = [t[2]![3]!, t[0]![3]!];
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toEqual(['Name:sha256']);
});

it('sums money exactly where floats would drift', async () => {
  const rows: Row[] = Array.from({ length: 10 }, (_, i) => [String(i), '0.1000', '0.10', 'a', 'b', '2026-01-01', '2026-01-01 00:00:00.000', '1']);
  const report = await run(rows, {}, rows);
  const price = report.tables[0]!.columns.find((c) => c.column === 'Price' && c.check === 'sum')!;
  expect(price.source).toBe('1.0000');
  expect(price.target).toBe('1.0000');
});

it('compares probe rows and reports the differing field', async () => {
  const t = base();
  t[1]![3] = 'Jose';
  const report = await run(t, { 'dbo.Items': [[2], [3]] });
  const probes = report.tables[0]!.probes;
  expect(probes.map((p) => p.key)).toEqual(['2', '3']);
  expect(probes[0]!.differences).toEqual([{ path: '$.Name', kind: 'changed', expected: 'José', actual: 'Jose' }]);
  expect(probes[1]!.differences).toEqual([]);
  expect(report.ok).toBe(false);
});

it('reports a probe key missing on the target', async () => {
  const report = await run(base().slice(0, 2), { 'dbo.Items': [[3]] });
  expect(report.tables[0]!.probes[0]!.differences.length).toBeGreaterThan(0);
});

it('rejects a source with zero rows as empty evidence', async () => {
  const report = await run([], {}, []);
  expect(report.ok).toBe(false);
});

it('counts foreign key orphans on the target', async () => {
  const fks: ForeignKey[] = [{ table: 'apps', columns: ['applicant_id'], refTable: 'applicants', refColumns: ['applicant_id'] }];
  expect(await countOrphans(fake('postgres', {}, '2'), fks)).toEqual([{ foreignKey: 'apps(applicant_id) -> applicants(applicant_id)', orphans: 2, childRows: 5 }]);
});

it('loads a mapping from a plain array and from an object with foreign keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'map-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(mapping));
  expect(loadMapping(join(dir, 'a.json'))).toEqual(mapping);
  expect(loadForeignKeys(join(dir, 'a.json'))).toEqual([]);
  const fk = { table: 'a', columns: ['b'], refTable: 'c', refColumns: ['d'] };
  writeFileSync(join(dir, 'b.json'), JSON.stringify({ tables: mapping, foreignKeys: [fk] }));
  expect(loadForeignKeys(join(dir, 'b.json'))).toEqual([fk]);
});

it('rejects a mapping with a key outside the columns or an unsafe name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'map-'));
  writeFileSync(join(dir, 'k.json'), JSON.stringify([{ ...mapping[0], key: ['Nope'] }]));
  expect(() => loadMapping(join(dir, 'k.json'))).toThrow(/key column Nope/);
  writeFileSync(join(dir, 'n.json'), JSON.stringify([{ ...mapping[0], source: 'x; DROP TABLE y' }]));
  expect(() => loadMapping(join(dir, 'n.json'))).toThrow(/Invalid mapping/);
});

it('fails when two rows swap a money value', async () => {
  const t = base();
  [t[0]![1], t[1]![1]] = [t[1]![1]!, t[0]![1]!];
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toEqual(['Price:sha256']);
});

it('fails on compensating plus x and minus x changes that keep every sum', async () => {
  const t = base();
  t[0]![1] = '89.1234';
  t[1]![1] = '9.0000';
  t[0]![2] = '13.50';
  t[2]![2] = '0.00';
  t[0]![0] = '1';
  const report = await run(t);
  expect(report.ok).toBe(false);
  expect(failing(report)).toEqual(['Price:sha256', 'Area:sha256']);
});

it('shows extra datetime precision on the target as a difference', async () => {
  const t = base();
  t[0]![6] = '2026-03-08 02:30:00.000123';
  const report = await run(t);
  expect(failing(report)).toEqual(['At:minMax', 'At:sha256']);
});

const goodReport = () => run(base(), { 'dbo.Items': [[1]] });
const okOrphans: OrphanCount[] = [{ foreignKey: 'a -> b', orphans: 0, childRows: 3 }];
const byName = (list: ReturnType<typeof evidenceFor>) => Object.fromEntries(list.map((e) => [e.name, e]));

it('evidenceFor passes all four checks for a normal run', async () => {
  const e = byName(evidenceFor(await goodReport(), okOrphans, 1000));
  expect(Object.values(e).map((x) => x.passed)).toEqual([true, true, true, true]);
  expect(e['migration-fk-orphans']!.examined).toBe(3);
  expect(e['migration-duration']!.examined).toBe(3);
});

it('evidenceFor never passes on an empty mapping', async () => {
  const empty = await validateMigration(fake('mssql', {}), fake('postgres', {}), [], {});
  expect(evidenceFor(empty, okOrphans, 1).map((x) => x.passed)).toEqual([false, false, true, false]);
});

it('evidenceFor never passes on zero source rows', async () => {
  const report = await run([], {}, []);
  const e = byName(evidenceFor(report, okOrphans, 1));
  expect(e['migration-row-counts']!.passed).toBe(false);
  expect(e['migration-duration']!.passed).toBe(false);
});

it('evidenceFor fails the orphan check with zero foreign keys, empty child tables or orphans', async () => {
  const report = await goodReport();
  expect(byName(evidenceFor(report, [], 1))['migration-fk-orphans']!.passed).toBe(false);
  expect(byName(evidenceFor(report, [{ foreignKey: 'a -> b', orphans: 0, childRows: 0 }], 1))['migration-fk-orphans']!.passed).toBe(false);
  expect(byName(evidenceFor(report, [{ foreignKey: 'a -> b', orphans: 1, childRows: 4 }], 1))['migration-fk-orphans']!.passed).toBe(false);
});

it('evidenceFor fails the column check without probes and the duration check over ten minutes', async () => {
  const noProbes = await run(base());
  expect(byName(evidenceFor(noProbes, okOrphans, 1))['migration-column-checks']!.passed).toBe(false);
  expect(byName(evidenceFor(await goodReport(), okOrphans, 600_001))['migration-duration']!.passed).toBe(false);
});
