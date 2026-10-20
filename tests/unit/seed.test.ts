import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeFee, PERMIT_TYPES, rawUnits } from '../src/seed/fee';
import { generateSeed } from '../src/seed/generate';
import { HOLIDAYS } from '../src/seed/holidays';
import { CATEGORY_NAMES } from '../src/seed/records';

const small = generateSeed('small');
const type = (code: string) => PERMIT_TYPES.find((t) => t.code === code)!;

describe('determinism', () => {
  it('produces byte-identical SQL and catalog on two runs', () => {
    const again = generateSeed('small');
    expect(again.sql).toBe(small.sql);
    expect(JSON.stringify(again.catalog)).toBe(JSON.stringify(small.catalog));
  });
});

describe('catalog', () => {
  it('has at least one reference for every category', () => {
    for (const name of CATEGORY_NAMES) {
      expect(small.catalog.categories[name]?.length, name).toBeGreaterThan(0);
    }
  });

  it('pins today and the search terms', () => {
    expect(small.catalog.fixedToday).toBe('2026-10-15');
    expect(small.catalog.searchTerms).toEqual(
      expect.arrayContaining(['tremblay', 'TREMBLAY', 'Tremblay ', 'Tremblé', 'macdonald', "O'B", 'PRM-2026', '', 'zzz-no-match']),
    );
  });

  it('uses half-way raw fees for every rounding probe', () => {
    expect(small.catalog.roundingHalfAreas.length).toBeGreaterThan(0);
    for (const probe of small.catalog.roundingHalfAreas) {
      const areaCents = Math.round(Number(probe.areaSqM) * 100);
      const raw = rawUnits(type(probe.permitTypeCode), areaCents, probe.isSenior, probe.isNonProfit);
      const text = String(raw).padStart(5, '0');
      const fraction = text.slice(-4);
      expect(fraction[2], `${probe.permitTypeCode} ${probe.areaSqM}`).toBe('5');
      expect(fraction[3]).toBe('0');
    }
  });
});

describe('computeFee', () => {
  it('rounds half away from zero (RENO 10.70)', () => {
    expect(computeFee(type('RENO'), 1070, false, false)).toEqual({ fee: '175.15', hst: '22.77', total: '197.92' });
  });

  it('lets non-profit win over senior (RENO 100.00)', () => {
    expect(computeFee(type('RENO'), 10000, true, true)).toEqual({ fee: '192.50', hst: '25.03', total: '217.53' });
  });

  it('applies the senior discount alone', () => {
    expect(computeFee(type('RENO'), 10000, true, false)).toEqual({ fee: '288.75', hst: '37.54', total: '326.29' });
  });

  it('handles a zero rate', () => {
    expect(computeFee(type('EVENT'), 5000, false, false)).toEqual({ fee: '75.00', hst: '9.75', total: '84.75' });
  });
});

describe('reference data mirrors', () => {
  const sqlText = readFileSync(fileURLToPath(new URL('../../legacy/db/04-reference-data.sql', import.meta.url)), 'utf8');

  it('matches the holidays in 04-reference-data.sql', () => {
    const fromSql = [...sqlText.matchAll(/INSERT INTO dbo\.Holidays \(HolidayDate, Name\) VALUES \('([\d-]+)'/g)].map((m) => m[1]);
    expect([...HOLIDAYS]).toEqual(fromSql);
  });

  it('matches the permit types in 04-reference-data.sql', () => {
    const fromSql = [
      ...sqlText.matchAll(/VALUES \('(\w+)', N'[^']*', ([\d.]+), ([\d.]+), (\d+), (\d)\)/g),
    ].map((m) => ({
      code: m[1],
      baseFeeCents: Math.round(Number(m[2]) * 100),
      rateCents: Math.round(Number(m[3]) * 100),
      reviewBusinessDays: Number(m[4]),
      isActive: m[5] === '1',
    }));
    expect(PERMIT_TYPES.map(({ code, baseFeeCents, rateCents, reviewBusinessDays, isActive }) => ({
      code, baseFeeCents, rateCents, reviewBusinessDays, isActive,
    }))).toEqual(fromSql);
  });
});

describe('generated SQL', () => {
  it('keeps insert batches within 500 rows and never touches reference tables', () => {
    expect(small.sql).not.toMatch(/INSERT INTO dbo\.(PermitTypes|Holidays)/);
    for (const batch of small.sql.split(/^GO$/m)) {
      const rows = batch.match(/^\(/gm)?.length ?? 0;
      expect(rows).toBeLessThanOrEqual(500);
    }
  });
});
