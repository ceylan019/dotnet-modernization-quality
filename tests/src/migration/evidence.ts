import type { CheckEvidence } from '../gate/evidence';
import type { MigrationReport } from './validate';

// The proposed downtime gate from the risk register: migration plus validation within 10 minutes.
export const DOWNTIME_LIMIT_MS = 10 * 60 * 1000;

export const EVIDENCE_NAMES = ['migration-row-counts', 'migration-column-checks', 'migration-fk-orphans', 'migration-duration'] as const;

export interface OrphanCount {
  foreignKey: string;
  orphans: number;
  childRows: number;
}

// Pure decision logic. Every check needs real rows examined: empty evidence never passes.
export function evidenceFor(report: MigrationReport, orphans: OrphanCount[], durationMs: number): CheckEvidence[] {
  const tables = report.tables;
  const countsOk = tables.length > 0 && tables.every((t) => t.sourceRows > 0 && t.sourceRows === t.targetRows);

  const badColumns = tables.flatMap((t) => t.columns.filter((c) => !c.ok).map((c) => `${t.table}.${c.column} ${c.check} source=${c.source} target=${c.target}`));
  const badProbes = tables.flatMap((t) => t.probes.filter((p) => p.differences.length > 0).map((p) => `${t.table}[${p.key}] ${p.differences.map((d) => d.path).join(',')}`));
  const probeCount = tables.reduce((n, t) => n + t.probes.length, 0);

  const orphanTotal = orphans.reduce((n, o) => n + o.orphans, 0);
  const childRows = orphans.reduce((n, o) => n + o.childRows, 0);
  const everyChildHasRows = orphans.length > 0 && orphans.every((o) => o.childRows > 0);

  return [
    {
      name: EVIDENCE_NAMES[0],
      risks: ['RISK-DATA-01'],
      passed: countsOk,
      examined: report.examinedRows,
      detail: tables.map((t) => `${t.table}: source ${t.sourceRows}, target ${t.targetRows}`).join('; ') || 'no tables in mapping',
    },
    {
      name: EVIDENCE_NAMES[1],
      risks: ['RISK-DATA-02'],
      passed: report.ok && badColumns.length === 0 && badProbes.length === 0 && probeCount > 0,
      examined: tables.reduce((n, t) => n + t.columns.length, 0) + probeCount,
      detail: [...badColumns, ...badProbes].join('; ') || (probeCount > 0 ? `all column checks and ${probeCount} probe rows match` : 'no probe rows supplied'),
    },
    {
      name: EVIDENCE_NAMES[2],
      risks: ['RISK-DATA-03'],
      passed: everyChildHasRows && orphanTotal === 0,
      examined: childRows,
      detail: orphans.map((o) => `${o.foreignKey}: ${o.orphans} orphans in ${o.childRows} child rows`).join('; ') || 'no foreign keys in mapping',
    },
    {
      name: EVIDENCE_NAMES[3],
      risks: ['RISK-DATA-04'],
      passed: report.examinedRows > 0 && durationMs <= DOWNTIME_LIMIT_MS,
      examined: report.examinedRows,
      detail: `${durationMs} ms for ${report.examinedRows} source rows, limit ${DOWNTIME_LIMIT_MS} ms`,
    },
  ];
}
