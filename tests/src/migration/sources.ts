import pg from 'pg';
import sql from 'mssql';
import type { ColumnMap } from './mapping';

export interface SqlSide {
  dialect: 'mssql' | 'postgres';
  query<T>(sql: string): Promise<T[]>;
  close?(): Promise<void>;
}

export async function mssqlSide(url: string): Promise<SqlSide> {
  const config = sql.ConnectionPool.parseConnectionString(url);
  config.requestTimeout = 300_000;
  const pool = await new sql.ConnectionPool(config).connect();
  return {
    dialect: 'mssql',
    async query<T>(text: string): Promise<T[]> {
      const result = await pool.request().query(text);
      return result.recordset as unknown as T[];
    },
    close: () => pool.close(),
  };
}

export async function postgresSide(url: string): Promise<SqlSide> {
  const pool = new pg.Pool({ connectionString: url, max: 2, options: '-c timezone=UTC' });
  await pool.query('SELECT 1');
  return {
    dialect: 'postgres',
    async query<T>(text: string): Promise<T[]> {
      const result = await pool.query(text);
      return result.rows as T[];
    },
    close: () => pool.end(),
  };
}

export function quoteIdent(dialect: SqlSide['dialect'], name: string): string {
  return name
    .split('.')
    .map((p) => (dialect === 'mssql' ? `[${p}]` : `"${p}"`))
    .join('.');
}

// Every value comes back as text (or a raw string for text kinds) so Node can compare both dialects the same way.
function selectExpr(dialect: SqlSide['dialect'], kind: ColumnMap['kind'], col: string): string {
  const c = quoteIdent(dialect, col);
  if (dialect === 'mssql') {
    switch (kind) {
      case 'text':
      case 'varchar':
        return c;
      case 'money':
        return `CONVERT(varchar(40), ${c}, 2)`;
      case 'date':
        return `CONVERT(varchar(10), ${c}, 23)`;
      case 'datetime':
        return `CONVERT(varchar(27), ${c}, 121)`;
      default:
        return `CAST(${c} AS varchar(40))`;
    }
  }
  switch (kind) {
    case 'text':
    case 'varchar':
      return c;
    case 'datetime':
      // Session time zone is UTC (see postgresSide), so timestamptz prints as UTC.
      return `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
    case 'bool':
      return `(CASE WHEN ${c} THEN 1 ELSE 0 END)::text`;
    default:
      return `${c}::text`;
  }
}

export type RawRow = Record<string, string | null>;

// Columns are aliased c0, c1, ... in the order of `columns`. PostgreSQL folds unquoted aliases to lower case, so c0 is safe.
export async function fetchRows(side: SqlSide, table: string, columns: { name: string; kind: ColumnMap['kind'] }[]): Promise<RawRow[]> {
  const list = columns.map((c, i) => `${selectExpr(side.dialect, c.kind, c.name)} AS c${i}`).join(', ');
  return side.query<RawRow>(`SELECT ${list} FROM ${quoteIdent(side.dialect, table)}`);
}
