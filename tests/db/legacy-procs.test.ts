import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectLegacy } from '../src/db/mssql';

const testsDir = fileURLToPath(new URL('../', import.meta.url));
let pool: sql.ConnectionPool;

beforeAll(async () => {
  if (!process.env.LEGACY_DB_URL) {
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  }
  execFileSync('npx', ['tsx', '--env-file-if-exists=../.env', 'src/db/reset-legacy-db.ts', '--seed', 'none'], {
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

async function fee(code: string, area: number, senior: number, nonProfit: number) {
  const result = await pool.request().query(`
DECLARE @f money, @h money, @t money;
EXEC dbo.usp_CalculateFee '${code}', ${area}, ${senior}, ${nonProfit}, @f OUTPUT, @h OUTPUT, @t OUTPUT;
SELECT CONVERT(varchar(20), @f) AS fee, CONVERT(varchar(20), @h) AS hst, CONVERT(varchar(20), @t) AS total;`);
  return result.recordset[0] as { fee: string; hst: string; total: string };
}

async function submit(last: string, first = 'Test', area = 20, type = 'RENO'): Promise<string> {
  const result = await pool
    .request()
    .input('FirstName', first)
    .input('LastName', last)
    .input('IsSenior', 0)
    .input('IsNonProfit', 0)
    .input('PermitTypeCode', type)
    .input('SiteAddress', '1 Test St')
    .input('AreaSqM', area)
    .input('SubmittedOn', '2026-10-15')
    .output('ReferenceNumber', sql.VarChar(20))
    .execute('dbo.usp_SubmitApplication');
  return result.output.ReferenceNumber as string;
}

async function changeStatus(ref: string, status: string, note: string | null = null) {
  return pool
    .request()
    .input('ReferenceNumber', ref)
    .input('NewStatus', status)
    .input('ChangedBy', 'clerk')
    .input('Note', note)
    .input('Today', '2026-10-15')
    .execute('dbo.usp_ChangeStatus');
}

describe('usp_ListPermitTypes', () => {
  it('returns active types in clustered key order', async () => {
    const result = await pool.request().execute('dbo.usp_ListPermitTypes');
    expect(result.recordset.map((r) => r.Code)).toEqual(['DECK', 'DEMO', 'EVENT', 'PATIO', 'RENO', 'SIGN']);
  });
});

describe('usp_CalculateFee', () => {
  it('rounds half away from zero', async () => {
    expect(await fee('RENO', 10.7, 0, 0)).toEqual({ fee: '175.15', hst: '22.77', total: '197.92' });
  });

  it('lets non-profit win over senior', async () => {
    expect(await fee('RENO', 100, 1, 1)).toEqual({ fee: '192.50', hst: '25.03', total: '217.53' });
  });

  it('applies the senior discount alone', async () => {
    expect(await fee('RENO', 100, 1, 0)).toEqual({ fee: '288.75', hst: '37.54', total: '326.29' });
  });

  it('rejects an inactive permit type', async () => {
    await expect(fee('FENCE', 10, 0, 0)).rejects.toThrow('Unknown or inactive permit type FENCE');
  });

  it('rejects an out of range area', async () => {
    await expect(fee('RENO', 0.5, 0, 0)).rejects.toThrow('Area must be between 1 and 10000 square metres');
  });
});

describe('fn_AddBusinessDays', () => {
  it.each([
    ['2026-10-09', 3, '2026-10-15'],
    ['2026-12-24', 2, '2026-12-30'],
    ['2024-02-29', 1, '2024-03-01'],
    ['2026-10-15', 10, '2026-10-29'],
  ])('%s + %i business days is %s', async (start, days, expected) => {
    const value = await scalar(`SELECT CONVERT(varchar(10), dbo.fn_AddBusinessDays('${start}', ${days}), 23)`);
    expect(value).toBe(expected);
  });
});

describe('fn_EffectiveStatus', () => {
  it.each([
    ['Submitted', '2026-04-17 23:30', 'Expired'],
    ['Submitted', '2026-04-18 00:00', 'Submitted'],
    ['Approved', '2020-01-01', 'Approved'],
  ])('%s last updated %s is %s', async (status, updated, expected) => {
    const value = await scalar(`SELECT dbo.fn_EffectiveStatus('${status}', '${updated}', '2026-10-15')`);
    expect(value).toBe(expected);
  });
});

describe('usp_SubmitApplication and usp_GetApplicationByReference', () => {
  it('creates a reference and finds it again with a trailing space', async () => {
    const ref = await submit('Okafor');
    expect(ref).toMatch(/^PRM-2026-\d{6}$/);

    const result = await pool
      .request()
      .input('ReferenceNumber', `${ref} `)
      .input('Today', '2026-10-15')
      .execute('dbo.usp_GetApplicationByReference');
    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0].Status).toBe('Submitted');
    expect(result.recordset[0].LastName).toBe('Okafor');
  });
});

describe('usp_ChangeStatus', () => {
  it('reports an unknown reference', async () => {
    await expect(changeStatus('PRM-2026-999999', 'UnderReview')).rejects.toThrow(
      'Application PRM-2026-999999 not found',
    );
  });

  it('reports an expired application before any other rule', async () => {
    const ref = await submit('Stale');
    await pool.request().query(`UPDATE dbo.Applications SET LastUpdatedAt = '2026-01-01' WHERE ReferenceNumber = '${ref}'`);
    await expect(changeStatus(ref, 'Approved')).rejects.toThrow(`Application ${ref} has expired`);
  });

  it('rejects an invalid transition', async () => {
    const ref = await submit('Skipper');
    await expect(changeStatus(ref, 'Approved')).rejects.toThrow(
      'Invalid status transition from Submitted to Approved',
    );
  });

  it('requires a note for Rejected and InfoRequested', async () => {
    const ref = await submit('Quiet');
    await changeStatus(ref, 'UnderReview');
    await expect(changeStatus(ref, 'Rejected')).rejects.toThrow('A note is required when status is Rejected');
    await expect(changeStatus(ref, 'InfoRequested')).rejects.toThrow('A note is required when status is InfoRequested');
  });

  it('records five history rows along the full path', async () => {
    const ref = await submit('Walker');
    await changeStatus(ref, 'UnderReview');
    await changeStatus(ref, 'InfoRequested', 'Need drawings');
    await changeStatus(ref, 'UnderReview');
    await changeStatus(ref, 'Approved');

    const history = await pool.request().input('ReferenceNumber', ref).execute('dbo.usp_GetStatusHistory');
    expect(history.recordset).toHaveLength(5);
  });
});

describe('usp_SearchApplications', () => {
  async function search(text: string) {
    const result = await pool
      .request()
      .input('SearchText', text)
      .input('Today', '2026-10-15')
      .execute('dbo.usp_SearchApplications');
    return result.recordset;
  }

  it('is case-insensitive and accent-sensitive', async () => {
    await submit('Tremblay', 'Marie');
    expect((await search('tremblay')).map((r) => r.LastName)).toContain('Tremblay');
    expect((await search('Tremblé')).map((r) => r.LastName)).not.toContain('Tremblay');
  });

  it('reports the total count on every row', async () => {
    const rows = await search('');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].TotalCount).toBeGreaterThanOrEqual(rows.length);
  });
});
