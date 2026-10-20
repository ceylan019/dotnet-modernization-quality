import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectLegacy } from '../src/db/mssql';
import type { Catalog } from '../src/seed/records';

const testsDir = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(readFileSync(new URL('../seed-data/catalog.json', import.meta.url), 'utf8')) as Catalog;
let pool: sql.ConnectionPool;

beforeAll(async () => {
  if (!process.env.LEGACY_DB_URL) {
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  }
  execFileSync('npx', ['tsx', '--env-file-if-exists=../.env', 'src/db/reset-legacy-db.ts', '--seed', 'small'], {
    cwd: testsDir,
    stdio: 'inherit',
  });
  pool = await connectLegacy('Permits');
});

afterAll(async () => {
  await pool?.close();
});

async function scalar(query: string): Promise<unknown> {
  const result = await pool.request().query(query);
  return Object.values(result.recordset[0])[0];
}

describe('small seed loaded into the legacy database', () => {
  it('holds at least 300 applications with matching references', async () => {
    expect(Number(await scalar('SELECT COUNT(*) FROM dbo.Applications'))).toBeGreaterThanOrEqual(300);
    expect(
      await scalar(`SELECT COUNT(*) FROM dbo.Applications
        WHERE ReferenceNumber <> 'PRM-' + CONVERT(char(4), YEAR(SubmittedOn)) + '-' + RIGHT('000000' + CONVERT(varchar(10), ApplicationId), 6)`),
    ).toBe(0);
  });

  it('stores only statuses the CHECK constraint allows, never Expired', async () => {
    expect(await scalar(`SELECT COUNT(*) FROM dbo.Applications WHERE Status = 'Expired'`)).toBe(0);
  });

  it('stores DueDate exactly as fn_AddBusinessDays computes it', async () => {
    expect(
      await scalar(`SELECT COUNT(*) FROM dbo.Applications a JOIN dbo.PermitTypes t ON t.Code = a.PermitTypeCode
        WHERE a.DueDate <> dbo.fn_AddBusinessDays(a.SubmittedOn, t.ReviewBusinessDays)`),
    ).toBe(0);
  });

  it('stores fees exactly as usp_CalculateFee computes them (active types, rounded rows)', async () => {
    const skip = catalog.categories.unroundedMoney.map((r) => `'${r}'`).join(',');
    const result = await pool.request().query(`
SET NOCOUNT ON;
DECLARE @mismatch int = 0, @checked int = 0, @id int = 0, @code varchar(20), @area decimal(9,2), @s bit, @n bit,
        @f money, @h money, @t money, @sf money, @sh money, @st money;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT a.ApplicationId, a.PermitTypeCode, a.AreaSqM, p.IsSenior, p.IsNonProfit, a.FeeAmount, a.HstAmount, a.TotalAmount
  FROM dbo.Applications a JOIN dbo.Applicants p ON p.ApplicantId = a.ApplicantId JOIN dbo.PermitTypes t ON t.Code = a.PermitTypeCode
  WHERE t.IsActive = 1 AND a.ReferenceNumber NOT IN (${skip});
OPEN c;
FETCH NEXT FROM c INTO @id, @code, @area, @s, @n, @sf, @sh, @st;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC dbo.usp_CalculateFee @code, @area, @s, @n, @f OUTPUT, @h OUTPUT, @t OUTPUT;
  SET @checked = @checked + 1;
  IF @f <> @sf OR @h <> @sh OR @t <> @st SET @mismatch = @mismatch + 1;
  FETCH NEXT FROM c INTO @id, @code, @area, @s, @n, @sf, @sh, @st;
END
SELECT @checked AS checked, @mismatch AS mismatch;`);
    expect(result.recordset[0].checked).toBeGreaterThan(250);
    expect(result.recordset[0].mismatch).toBe(0);
  });

  it('has history rows consistent with each application status path', async () => {
    expect(
      await scalar(`SELECT COUNT(*) FROM dbo.Applications a WHERE
        (SELECT COUNT(*) FROM dbo.ApplicationStatusHistory h WHERE h.ApplicationId = a.ApplicationId AND h.FromStatus IS NULL
           AND h.ToStatus = 'Submitted' AND h.ChangedBy = N'applicant') <> 1
        OR (SELECT TOP 1 h.ToStatus FROM dbo.ApplicationStatusHistory h WHERE h.ApplicationId = a.ApplicationId
            ORDER BY h.ChangedAt DESC, h.HistoryId DESC) <> a.Status
        OR (SELECT MAX(h.ChangedAt) FROM dbo.ApplicationStatusHistory h WHERE h.ApplicationId = a.ApplicationId) <> a.LastUpdatedAt`),
    ).toBe(0);
    expect(
      await scalar(`SELECT COUNT(*) FROM dbo.ApplicationStatusHistory h
        JOIN dbo.ApplicationStatusHistory p ON p.ApplicationId = h.ApplicationId AND p.HistoryId = h.HistoryId - 1
        WHERE h.FromStatus <> p.ToStatus`),
    ).toBe(0);
  });

  it('resolves every catalog reference to a row, with the expected expiry boundary', async () => {
    const all = Object.values(catalog.categories).flat();
    const refs = [...new Set(all)].map((r) => `'${r}'`).join(',');
    expect(await scalar(`SELECT COUNT(*) FROM dbo.Applications WHERE ReferenceNumber IN (${refs})`)).toBe(new Set(all).size);
    const rows = await pool.request().query(`
      SELECT dbo.fn_EffectiveStatus(Status, LastUpdatedAt, '2026-10-15') AS Effective, LastUpdatedAt
      FROM dbo.Applications WHERE ReferenceNumber IN (${catalog.categories.expiryBoundary.slice(0, 2).map((r) => `'${r}'`).join(',')})
      ORDER BY LastUpdatedAt`);
    expect(rows.recordset.map((r) => r.Effective)).toEqual(['Expired', 'Submitted']);
  });

  it('continues identity values after the explicit ids', async () => {
    const max = Number(await scalar('SELECT MAX(ApplicationId) FROM dbo.Applications'));
    const ref = await pool
      .request()
      .input('FirstName', 'Next').input('LastName', 'Id').input('IsSenior', 0).input('IsNonProfit', 0)
      .input('PermitTypeCode', 'RENO').input('SiteAddress', '1 Test St').input('AreaSqM', 20)
      .input('SubmittedOn', '2026-10-15').output('ReferenceNumber', sql.VarChar(20))
      .execute('dbo.usp_SubmitApplication');
    expect(ref.output.ReferenceNumber).toBe(`PRM-2026-${String(max + 1).padStart(6, '0')}`);
  });
});
