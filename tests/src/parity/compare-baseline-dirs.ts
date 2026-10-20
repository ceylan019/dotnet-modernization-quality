import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isEntrypoint } from '../gate/entrypoint';

// Folders holding timings or scores. They vary between runs by nature and are not parity baselines.
const SKIPPED_TOP_LEVEL = new Set(['lighthouse', 'perf']);

function listJson(root: string, rel = ''): string[] {
  return readdirSync(join(root, rel)).flatMap((name) => {
    const next = rel ? `${rel}/${name}` : name;
    if (!rel && SKIPPED_TOP_LEVEL.has(name)) return [];
    if (statSync(join(root, next)).isDirectory()) return listJson(root, next);
    return name.endsWith('.json') ? [next] : [];
  });
}

function withoutRecordedAt(text: string): string {
  const parsed = JSON.parse(text) as unknown;
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    delete (parsed as Record<string, unknown>).recordedAt;
  }
  return JSON.stringify(sortKeys(parsed));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

export interface DirComparison {
  files: number;
  onlyInFirst: string[];
  onlyInSecond: string[];
  different: string[];
  // First differing JSON path per different file, with both values.
  firstDifferences: Record<string, { path: string; first: unknown; second: unknown }>;
}

function firstDifference(a: unknown, b: unknown, path = '$'): { path: string; first: unknown; second: unknown } | undefined {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return undefined;
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
    return undefined;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? undefined : { path, first: a, second: b };
}

function parseWithoutRecordedAt(text: string): unknown {
  return JSON.parse(withoutRecordedAt(text));
}

// Two record passes must agree on everything except recordedAt. An empty pair of folders never counts as agreement.
export function compareBaselineDirs(first: string, second: string): DirComparison {
  const a = new Set(listJson(first));
  const b = new Set(listJson(second));
  const both = [...a].filter((f) => b.has(f)).sort();
  const different = both.filter((f) => withoutRecordedAt(readFileSync(join(first, f), 'utf8')) !== withoutRecordedAt(readFileSync(join(second, f), 'utf8')));
  const firstDifferences: DirComparison['firstDifferences'] = {};
  for (const f of different) {
    const d = firstDifference(parseWithoutRecordedAt(readFileSync(join(first, f), 'utf8')), parseWithoutRecordedAt(readFileSync(join(second, f), 'utf8')));
    if (d) firstDifferences[f] = d;
  }
  return {
    files: both.length,
    onlyInFirst: [...a].filter((f) => !b.has(f)).sort(),
    onlyInSecond: [...b].filter((f) => !a.has(f)).sort(),
    different,
    firstDifferences,
  };
}

export function isDeterministic(c: DirComparison): boolean {
  return c.files > 0 && c.onlyInFirst.length === 0 && c.onlyInSecond.length === 0 && c.different.length === 0;
}

function main(): void {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [first, second] = positionals;
  if (!first || !second) throw new Error('Usage: tsx src/parity/compare-baseline-dirs.ts <first dir> <second dir>');
  const result = compareBaselineDirs(first, second);
  console.log(JSON.stringify({ files: result.files, onlyInFirst: result.onlyInFirst, onlyInSecond: result.onlyInSecond, different: result.different, firstDifferences: result.firstDifferences }, null, 2));
  process.exitCode = isDeterministic(result) ? 0 : 1;
}

if (isEntrypoint(process.argv[1], import.meta.url)) main();
