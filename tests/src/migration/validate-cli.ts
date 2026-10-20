import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_EVIDENCE_DIR, writeCheckEvidence } from '../gate/evidence';
import { EVIDENCE_NAMES, evidenceFor } from './evidence';
import { loadForeignKeys, loadMapping } from './mapping';
import { mssqlSide, postgresSide } from './sources';
import { countOrphans, validateMigration } from './validate';

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

  // A crash must not leave an earlier passed result behind.
  for (const n of EVIDENCE_NAMES) rmSync(join(DEFAULT_EVIDENCE_DIR, `${n}.json`), { force: true });

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

    const evidence = evidenceFor(report, orphans, durationMs);
    for (const e of evidence) writeCheckEvidence(e);

    const allPassed = evidence.every((e) => e.passed);
    console.log(JSON.stringify({ ok: allPassed, checks: evidence.map((e) => ({ name: e.name, passed: e.passed })), durationMs }, null, 2));
    process.exitCode = allPassed ? 0 : 1;
  } finally {
    await src.close?.();
    await dst.close?.();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
