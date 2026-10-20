import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { connectLegacy } from '../src/db/mssql';
import type { TableMap } from '../src/migration/mapping';
import { mssqlSide, postgresSide, type SqlSide } from '../src/migration/sources';
import { validateMigration } from '../src/migration/validate';

const SCRATCH = 'MigValidateScratch';
let url = '';
let source: SqlSide;
let copy: SqlSide;
let pgPool: pg.Pool;
let pgSide: SqlSide;

const columns = (table: string): TableMap => ({
  source: `dbo.${table}`,
  target: `dbo.${table}`,
  key: ['Id'],
  columns: [
    { source: 'Id', target: 'Id', kind: 'int' },
    { source: 'Price', target: 'Price', kind: 'money' },
    { source: 'Area', target: 'Area', kind: 'decimal' },
    { source: 'Name', target: 'Name', kind: 'text' },
    { source: 'Addr', target: 'Addr', kind: 'varchar' },
    { source: 'Note', target: 'Note', kind: 'text' },
    { source: 'Day', target: 'Day', kind: 'date' },
    { source: 'At', target: 'At', kind: 'datetime' },
    { source: 'Flag', target: 'Flag', kind: 'bool' },
  ],
});

const pgMapping: TableMap = {
  source: 'dbo.MigItems',
  target: 'mig_items_validate',
  key: ['Id'],
  columns: columns('MigItems').columns.map((c) => ({ ...c, target: c.source.toLowerCase() })),
};

beforeAll(async () => {
  if (!process.env.LEGACY_DB_URL) process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  const master = await connectLegacy();
  await master.request().query(`IF DB_ID('${SCRATCH}') IS NOT NULL BEGIN ALTER DATABASE ${SCRATCH} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${SCRATCH}; END; CREATE DATABASE ${SCRATCH};`);
  await master.close();

  const db = await connectLegacy(SCRATCH);
  await db.request().query(`
CREATE TABLE dbo.MigItems (Id int NOT NULL PRIMARY KEY, Price money NOT NULL, Area decimal(9,2) NOT NULL, Name nvarchar(100) NOT NULL,
  Addr varchar(200) NOT NULL, Note nvarchar(max) NULL, Day date NOT NULL, At datetime NOT NULL, Flag bit NOT NULL);
INSERT dbo.MigItems VALUES
 (1, 88.1234, 12.50, N'Trail ', 'Cafe', NULL, '2026-01-02', '2026-03-08 02:30:00', 1),
 (2, 10.00, 3.25, N'Jos' + NCHAR(233), 'Plain', N'', '2026-02-03', '2026-03-09 10:00:00.003', 0),
 (3, 0.50, 1.00, N'Plain', 'Rue ' + CHAR(233), N'x', '2026-04-05', '2026-04-05 23:59:59.997', 1);
SELECT * INTO dbo.MigItemsCopy FROM dbo.MigItems;`);
  await db.close();

  url = process.env.LEGACY_DB_URL!.replace(/((?:^|;)\s*Database\s*=)[^;]*/i, `$1${SCRATCH}`);
  source = await mssqlSide(url);
  copy = source;

  pgPool = new pg.Pool({ connectionString: process.env.MODERN_DB_URL });
  pgSide = await postgresSide(process.env.MODERN_DB_URL!);
  await pgPool.query('DROP TABLE IF EXISTS mig_items_validate');
  await pgPool.query(`CREATE TABLE mig_items_validate (id int PRIMARY KEY, price numeric(19,4) NOT NULL, area numeric(9,2) NOT NULL, name text NOT NULL,
    addr text NOT NULL, note text, day date NOT NULL, at timestamp(3) NOT NULL, flag boolean NOT NULL)`);
  await pgPool.query(`INSERT INTO mig_items_validate VALUES
    (1, 88.1234, 12.50, 'Trail ', 'Cafe', NULL, '2026-01-02', '2026-03-08 02:30:00', true),
    (2, 10.00, 3.25, E'José', 'Plain', '', '2026-02-03', '2026-03-09 10:00:00.003', false),
    (3, 0.50, 1.00, 'Plain', E'Rue é', 'x', '2026-04-05', '2026-04-05 23:59:59.997', true)`);
});

afterAll(async () => {
  await pgPool?.query('DROP TABLE IF EXISTS mig_items_validate');
  await pgPool?.end();
  await pgSide?.close?.();
  await source?.close?.();
  const master = await connectLegacy();
  await master.request().query(`IF DB_ID('${SCRATCH}') IS NOT NULL BEGIN ALTER DATABASE ${SCRATCH} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${SCRATCH}; END`);
  await master.close();
});

it('validates a SQL Server table copied within SQL Server, then fails after one altered value', async () => {
  const map: TableMap = { ...columns('MigItems'), target: 'dbo.MigItemsCopy' };
  const good = await validateMigration(source, copy, [map], { 'dbo.MigItems': [[1], [2], [3]] });
  expect(good.tables[0]!.columns.filter((c) => !c.ok)).toEqual([]);
  expect(good.ok).toBe(true);

  const db = await connectLegacy(SCRATCH);
  await db.request().query('UPDATE dbo.MigItemsCopy SET Price = 88.1235 WHERE Id = 1');
  await db.close();
  const bad = await validateMigration(source, copy, [map], { 'dbo.MigItems': [[1]] });
  expect(bad.ok).toBe(false);
  expect(bad.tables[0]!.probes[0]!.differences).toEqual([{ path: '$.Price', kind: 'changed', expected: '88.1234', actual: '88.1235' }]);
});

it('validates SQL Server against PostgreSQL, then fails after one altered value', async () => {
  const good = await validateMigration(source, pgSide, [pgMapping], { 'dbo.MigItems': [[1], [2], [3]] });
  expect(good.tables[0]!.columns.filter((c) => !c.ok)).toEqual([]);
  expect(good.ok).toBe(true);

  await pgPool.query(`UPDATE mig_items_validate SET name = 'Trail' WHERE id = 1`);
  const bad = await validateMigration(source, pgSide, [pgMapping], {});
  expect(bad.ok).toBe(false);
});
