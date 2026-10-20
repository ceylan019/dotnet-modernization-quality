import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { writeCheckEvidence } from '../gate/evidence';
import { loadForeignKeys, loadMapping } from './mapping';
import { mssqlSide, postgresSide } from './sources';
import { countOrphans, validateMigration } from './validate';

// The proposed downtime gate from the risk register: migration plus validation within 10 minutes.
const DOWNTIME_LIMIT_MS = 10 * 60 * 1000;

function withDatabase(url: string, database: string): string {
  return /(^|;)\s*(Database|Initial Catalog)\s*=/i.test(url)
    ? url.replace(/((?:^|;)\s*(?:Database|Initial Catalog)\s*=)[^;]*/i, `$1${database}`)
    : `${url.replace(/;?$/, ';')}Database=${database}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mapping: { type: 'string' },
      probes: { type: 'string' },
      'source-url': { type: 'string' },
      'target-url': { type: 'string' },
      'source-database': { type: 'string', default: 'Permits' },
    },
  });
  if (!values.mapping) throw new Error('Usage: validate-cli --mapping <file> [--probes <file>] [--source-url ...] [--target-url ...]');

  const sourceUrl = values['source-url'] ?? (process.env.LEGACY_DB_URL ? withDatabase(process.env.LEGACY_DB_URL, values['source-database']!) : undefined);
  const targetUrl = values['target-url'] ?? process.env.MODERN_DB_URL;
  if (!sourceUrl || !targetUrl) throw new Error('Set LEGACY_DB_URL and MODERN_DB_URL, or pass --source-url and --target-url.');

  const mapping = loadMapping(values.mapping);
  const foreignKeys = loadForeignKeys(values.mapping);
  const probes = values.probes ? (JSON.parse(readFileSync(values.probes, 'utf8')) as Record<string, (string | number)[][]>) : {};

  const started = Date.now();
  const src = await mssqlSide(sourceUrl);
  const dst = await postgresSide(targetUrl);
  try {
    const report = await validateMigration(src, dst, mapping, probes);
    const orphans = await countOrphans(dst, foreignKeys);
    const durationMs = Date.now() - started;

    const rowLines = report.tables.map((t) => `${t.table}: source ${t.sourceRows}, target ${t.targetRows}`);
    const countsOk = report.tables.length > 0 && report.tables.every((t) => t.sourceRows > 0 && t.sourceRows === t.targetRows);
    writeCheckEvidence({
      name: 'migration-row-counts',
      risks: ['RISK-DATA-01'],
      passed: countsOk,
      examined: report.examinedRows,
      detail: rowLines.join('; ') || 'no tables in mapping',
    });

    const badColumns = report.tables.flatMap((t) => t.columns.filter((c) => !c.ok).map((c) => `${t.table}.${c.column} ${c.check} source=${c.source} target=${c.target}`));
    const badProbes = report.tables.flatMap((t) => t.probes.filter((p) => p.differences.length > 0).map((p) => `${t.table}[${p.key}] ${p.differences.map((d) => d.path).join(',')}`));
    const probeCount = report.tables.reduce((n, t) => n + t.probes.length, 0);
    writeCheckEvidence({
      name: 'migration-column-checks',
      risks: ['RISK-DATA-02'],
      passed: report.ok && badColumns.length === 0 && badProbes.length === 0 && probeCount > 0,
      examined: report.tables.reduce((n, t) => n + t.columns.length, 0) + probeCount,
      detail: [...badColumns, ...badProbes].join('; ') || `all column checks and ${probeCount} probe rows match`,
    });

    const orphanTotal = orphans.reduce((n, o) => n + o.orphans, 0);
    writeCheckEvidence({
      name: 'migration-fk-orphans',
      risks: ['RISK-DATA-03'],
      passed: orphans.length > 0 && orphanTotal === 0,
      examined: orphans.length,
      detail: orphans.map((o) => `${o.foreignKey}: ${o.orphans} orphans`).join('; ') || 'no foreign keys in mapping',
    });

    writeCheckEvidence({
      name: 'migration-duration',
      risks: ['RISK-DATA-04'],
      passed: durationMs <= DOWNTIME_LIMIT_MS,
      examined: report.examinedRows,
      detail: `${durationMs} ms for ${report.examinedRows} source rows, limit ${DOWNTIME_LIMIT_MS} ms`,
    });

    console.log(JSON.stringify({ ok: report.ok, orphanTotal, durationMs }, null, 2));
    process.exitCode = report.ok && orphanTotal === 0 ? 0 : 1;
  } finally {
    await src.close?.();
    await dst.close?.();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
