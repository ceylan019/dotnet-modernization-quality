import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { connectLegacy } from './mssql';
import { runSqlFiles } from './run-sql-files';

const DATABASE = 'Permits';
const USAGE = 'Usage: tsx src/db/reset-legacy-db.ts --seed none|small|large';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const schemaDir = join(repoRoot, 'legacy', 'db');

const seeds = {
  none: null,
  small: { file: join(repoRoot, 'tests', 'seed-data', 'seed-small.sql'), command: 'npm run seed:small' },
  large: { file: join(repoRoot, 'tests', 'reports', 'seed-large', 'seed-large.sql'), command: 'npm run seed:large' },
} as const;

type Seed = keyof typeof seeds;

function parseSeed(args: string[]): Seed {
  const { values } = parseArgs({ args, options: { seed: { type: 'string' } } });
  const seed = values.seed;
  if (seed === 'none' || seed === 'small' || seed === 'large') {
    return seed;
  }
  throw new Error(USAGE);
}

async function main(): Promise<void> {
  const seedName = parseSeed(process.argv.slice(2));
  const seed = seeds[seedName];
  if (seed && !existsSync(seed.file)) {
    throw new Error(
      `Seed file not found: ${relative(repoRoot, seed.file)}. Generate it with "${seed.command}" in tests/ first.`,
    );
  }

  const schemaFiles = (await readdir(schemaDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join(schemaDir, name));

  const master = await connectLegacy('master');
  try {
    await master.request().batch(`
IF DB_ID(N'${DATABASE}') IS NOT NULL
BEGIN
    ALTER DATABASE [${DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [${DATABASE}];
END;
CREATE DATABASE [${DATABASE}] COLLATE SQL_Latin1_General_CP1_CI_AS;`);
  } finally {
    await master.close();
  }

  const pool = await connectLegacy(DATABASE);
  try {
    await runSqlFiles(pool, seed ? [...schemaFiles, seed.file] : schemaFiles);
  } finally {
    await pool.close();
  }

  console.log(`Database ${DATABASE} recreated: ${schemaFiles.length} script(s) from legacy/db, seed ${seedName}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
