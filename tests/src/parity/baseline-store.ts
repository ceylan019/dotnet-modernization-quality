import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Json } from './normalize';

export interface BaselineCase {
  suite: string;
  caseId: string;
  risks: string[];
  request: Json;
  normalized: Json;
  recordedAt: string;
}

// Kebab case, dots allowed for numbers such as fee-reno-10.70-senior.
const NAME = /^[a-z0-9][a-z0-9.-]*$/;

const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number(), z.string(), z.array(jsonSchema), z.record(z.string(), jsonSchema),
]));

const caseSchema = z.strictObject({
  suite: z.string(),
  caseId: z.string(),
  risks: z.array(z.string()),
  request: jsonSchema,
  normalized: jsonSchema,
  recordedAt: z.iso.datetime(),
});

export function baselinesRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BASELINES_DIR) return env.BASELINES_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'baselines', 'legacy');
}

function fileFor(root: string, suite: string, caseId: string): string {
  if (!NAME.test(suite) || suite.includes('..')) throw new Error(`Invalid suite name "${suite}"`);
  if (!NAME.test(caseId) || caseId.includes('..')) throw new Error(`Invalid caseId "${caseId}"`);
  return join(root, suite, `${caseId}.json`);
}

export function writeBaselineCase(c: BaselineCase, root = baselinesRoot()): void {
  const file = fileFor(root, c.suite, c.caseId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(c, null, 2)}\n`);
}

export function readBaselineCase(suite: string, caseId: string, root = baselinesRoot()): BaselineCase | undefined {
  const file = fileFor(root, suite, caseId);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  let parsed: z.infer<typeof caseSchema>;
  try {
    parsed = caseSchema.parse(JSON.parse(text));
  } catch (e) {
    throw new Error(`Baseline ${suite}/${caseId} is unreadable: ${(e as Error).message}`, { cause: e });
  }
  if (parsed.suite !== suite || parsed.caseId !== caseId) {
    throw new Error(`Baseline ${suite}/${caseId} records ${parsed.suite}/${parsed.caseId}`);
  }
  return parsed;
}
