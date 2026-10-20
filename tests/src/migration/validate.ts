import { createHash } from 'node:crypto';
import { diffJson, type Difference } from '../parity/diff';
import type { Json } from '../parity/normalize';
import type { OrphanCount } from './evidence';
import type { ColumnMap, ForeignKey, TableMap } from './mapping';
import { fetchRows, quoteIdent, type RawRow, type SqlSide } from './sources';

export interface ColumnCheck {
  column: string;
  check: string;
  source: string;
  target: string;
  ok: boolean;
}

export interface TableReport {
  table: string;
  sourceRows: number;
  targetRows: number;
  columns: ColumnCheck[];
  probes: { key: string; differences: Difference[] }[];
}

export interface MigrationReport {
  tables: TableReport[];
  ok: boolean;
  examinedRows: number;
  durationMs: number;
}

const SCALE = 4;
const NUMERIC_KINDS: ColumnMap['kind'][] = ['money', 'decimal', 'int', 'bool'];
const TEXT_KINDS: ColumnMap['kind'][] = ['text', 'varchar'];

// Exact decimal text to an integer scaled by 10^SCALE. Never goes through a JS float.
export function toScaled(value: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!m) throw new Error(`Not a decimal number: ${JSON.stringify(value)}`);
  const frac = m[3] ?? '';
  if (/[1-9]/.test(frac.slice(SCALE))) throw new Error(`More than ${SCALE} decimal places: ${value}`);
  const scaled = BigInt(m[2]! + frac.slice(0, SCALE).padEnd(SCALE, '0'));
  return m[1] ? -scaled : scaled;
}

export function formatScaled(n: bigint): string {
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(SCALE + 1, '0');
  return `${neg ? '-' : ''}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

// date -> YYYY-MM-DD; datetime -> YYYY-MM-DDTHH:MM:SS.uuuuuu. SQL Server datetime has millisecond
// precision, so its fraction is padded with zeros to microseconds. Extra precision on the target
// (nonzero digits beyond what the source holds) is kept, so it shows up as a difference.
function normalizeValue(kind: ColumnMap['kind'], raw: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  switch (kind) {
    case 'money':
    case 'decimal':
      return formatScaled(toScaled(raw));
    case 'int':
    case 'bool':
      return String(toScaled(raw) / 10n ** BigInt(SCALE));
    case 'date':
      return raw.slice(0, 10);
    case 'datetime': {
      const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/.exec(raw);
      if (!m) throw new Error(`Not a datetime: ${raw}`);
      let frac = m[3] ?? '';
      if (frac.length > 6 && !/[1-9]/.test(frac.slice(6))) frac = frac.slice(0, 6);
      return `${m[1]}T${m[2]}.${frac.padEnd(6, '0')}`;
    }
    default:
      return raw;
  }
}

interface Normalized {
  keyText: string;
  keyParts: string[];
  values: (string | null)[];
}

async function load(side: SqlSide, table: string, map: TableMap, which: 'source' | 'target'): Promise<Normalized[]> {
  const cols = map.columns.map((c) => ({ name: c[which], kind: c.kind }));
  const raw = await fetchRows(side, table, cols);
  const keyIdx = map.key.map((k) => map.columns.findIndex((c) => c.source === k));
  const rows = raw.map((r: RawRow) => {
    const values = map.columns.map((c, i) => normalizeValue(c.kind, r[`c${i}`] ?? null));
    const keyParts = keyIdx.map((i) => values[i] ?? '');
    return { keyText: keyParts.join('|'), keyParts, values };
  });
  const numericKey = keyIdx.map((i) => map.columns[i]!.kind === 'int');
  const cmp = (a: Normalized, b: Normalized): number => {
    for (let i = 0; i < keyIdx.length; i++) {
      const x = a.keyParts[i]!;
      const y = b.keyParts[i]!;
      if (x === y) continue;
      if (numericKey[i]) return BigInt(x) < BigInt(y) ? -1 : 1;
      return x < y ? -1 : 1;
    }
    return 0;
  };
  return rows.sort(cmp);
}

function sha256(values: (string | null)[]): string {
  const h = createHash('sha256');
  for (const v of values) h.update(`${JSON.stringify(v)}\n`);
  return h.digest('hex');
}

const charLength = (s: string): number => Array.from(s).length;

function summarize(kind: ColumnMap['kind'], rows: Normalized[], idx: number): { check: string; value: string }[] {
  const values = rows.map((r) => r.values[idx] ?? null);
  const present = values.filter((v): v is string => v !== null);
  const out = [{ check: 'nonNull', value: String(present.length) }];
  // Aggregates are kept for readable diffs; the key-ordered hash catches swapped and compensating changes.
  if (NUMERIC_KINDS.includes(kind)) {
    // int and bool sums use the same scaled arithmetic, so they print with scale 4 too.
    const total = present.reduce((acc, v) => acc + toScaled(v), 0n);
    out.push({ check: 'sum', value: formatScaled(total) });
  } else if (kind === 'date' || kind === 'datetime') {
    const sorted = [...present].sort();
    out.push({ check: 'minMax', value: present.length ? `${sorted[0]}..${sorted[sorted.length - 1]}` : '' });
  } else if (TEXT_KINDS.includes(kind)) {
    out.push({ check: 'length', value: String(present.reduce((acc, v) => acc + charLength(v), 0)) });
  }
  out.push({ check: 'sha256', value: sha256(values) });
  return out;
}

export async function validateMigration(
  src: SqlSide,
  dst: SqlSide,
  mapping: TableMap[],
  probeKeys: Record<string, (string | number)[][]>,
): Promise<MigrationReport> {
  const started = Date.now();
  const tables: TableReport[] = [];
  let examinedRows = 0;

  for (const map of mapping) {
    const [srcRows, dstRows] = await Promise.all([
      load(src, map.source, map, 'source'),
      load(dst, map.target, map, 'target'),
    ]);
    examinedRows += srcRows.length;

    const columns: ColumnCheck[] = [];
    map.columns.forEach((c, idx) => {
      const a = summarize(c.kind, srcRows, idx);
      const b = summarize(c.kind, dstRows, idx);
      a.forEach((s, i) => columns.push({ column: c.source, check: s.check, source: s.value, target: b[i]!.value, ok: s.value === b[i]!.value }));
    });

    const asObject = (row: Normalized | undefined): Json =>
      row ? Object.fromEntries(map.columns.map((c, i) => [c.source, row.values[i] ?? null])) : null;
    const probes = (probeKeys[map.source] ?? []).map((tuple) => {
      const key = tuple.map(String).join('|');
      const find = (rows: Normalized[]) => rows.find((r) => r.keyText === key);
      return { key, differences: diffJson(asObject(find(srcRows)), asObject(find(dstRows))) };
    });

    tables.push({ table: map.source, sourceRows: srcRows.length, targetRows: dstRows.length, columns, probes });
  }

  const ok =
    tables.length > 0 &&
    tables.every((t) => t.sourceRows > 0 && t.sourceRows === t.targetRows && t.columns.every((c) => c.ok) && t.probes.every((p) => p.differences.length === 0));
  return { tables, ok, examinedRows, durationMs: Date.now() - started };
}

export async function countOrphans(side: SqlSide, fks: ForeignKey[]): Promise<OrphanCount[]> {
  const q = (n: string) => quoteIdent(side.dialect, n);
  const out: OrphanCount[] = [];
  for (const fk of fks) {
    const on = fk.columns.map((c, i) => `c.${q(c)} = p.${q(fk.refColumns[i]!)}`).join(' AND ');
    const notNull = fk.columns.map((c) => `c.${q(c)} IS NOT NULL`).join(' AND ');
    const text =
      `SELECT COUNT(*) AS n FROM ${q(fk.table)} c LEFT JOIN ${q(fk.refTable)} p ON ${on} ` +
      `WHERE p.${q(fk.refColumns[0]!)} IS NULL AND ${notNull}`;
    const [row] = await side.query<{ n: string | number }>(text);
    const [child] = await side.query<{ n: string | number }>(`SELECT COUNT(*) AS n FROM ${q(fk.table)}`);
    out.push({
      foreignKey: `${fk.table}(${fk.columns.join(', ')}) -> ${fk.refTable}(${fk.refColumns.join(', ')})`,
      orphans: Number(row?.n ?? 0),
      childRows: Number(child?.n ?? 0),
    });
  }
  return out;
}
