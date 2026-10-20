import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resetRng } from './rng';
import { buildDataset, type Catalog } from './records';
import { writeSql } from './sql-writer';

export type SeedSize = 'small' | 'large';

const SIZES: Record<SeedSize, number> = { small: 300, large: 50_000 };

export function generateSeed(size: SeedSize): { sql: string; catalog: Catalog } {
  resetRng();
  const data = buildDataset(SIZES[size]);
  return { sql: writeSql(data), catalog: data.catalog };
}

function main(): void {
  const { values } = parseArgs({ options: { size: { type: 'string' }, out: { type: 'string' } } });
  const size = values.size;
  if ((size !== 'small' && size !== 'large') || !values.out) {
    throw new Error('Usage: tsx src/seed/generate.ts --size small|large --out <dir>');
  }
  const out = resolve(values.out);
  const { sql, catalog } = generateSeed(size);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `seed-${size}.sql`), sql, 'utf8');
  writeFileSync(join(out, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${join(out, `seed-${size}.sql`)} and catalog.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
