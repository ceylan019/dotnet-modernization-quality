import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type sql from 'mssql';

const GO_LINE = /^\s*GO\s*$/i;

function splitBatches(script: string): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  for (const line of script.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (GO_LINE.test(line)) {
      batches.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  batches.push(current.join('\n'));
  return batches.filter((batch) => batch.trim().length > 0);
}

export async function runSqlFiles(pool: sql.ConnectionPool, files: string[]): Promise<void> {
  for (const file of files) {
    const batches = splitBatches(await readFile(file, 'utf8'));
    for (const [index, batch] of batches.entries()) {
      try {
        await pool.request().batch(batch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${basename(file)}, batch ${index + 1} of ${batches.length}: ${message}`, { cause: error });
      }
    }
  }
}
