import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const CheckEvidenceSchema = z.strictObject({
  name: z.string().min(1),
  risks: z.array(z.string()),
  passed: z.boolean(),
  examined: z.number(),
  detail: z.string(),
});

export type CheckEvidence = z.infer<typeof CheckEvidenceSchema>;

export const DEFAULT_EVIDENCE_DIR = 'reports/evidence';

export function writeCheckEvidence(e: CheckEvidence, dir = DEFAULT_EVIDENCE_DIR): void {
  mkdirSync(dir, { recursive: true });
  const file = `${e.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.json`;
  writeFileSync(join(dir, file), `${JSON.stringify(e, null, 2)}\n`);
}

export function readCheckEvidence(dir: string): CheckEvidence[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const parsed = CheckEvidenceSchema.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
      if (!parsed.success) {
        throw new Error(`Invalid check evidence ${f}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      return parsed.data;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
