import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Difference } from './diff';

const schema = z.array(z.strictObject({
  id: z.string().min(1),
  suite: z.string().min(1),
  caseId: z.string().min(1),
  path: z.string().min(1),
  reason: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  approvedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defect: z.string().min(1).optional(),
}));

export type ApprovedDifference = z.infer<typeof schema>[number];

export function loadApprovedDifferences(file = 'approved-differences.json'): ApprovedDifference[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read approved differences from ${file}: ${(e as Error).message}`, { cause: e });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid approved differences in ${file}: ${issues}`);
  }
  const seen = new Set<string>();
  for (const a of parsed.data) {
    if (seen.has(a.id)) throw new Error(`Duplicate approved difference id ${a.id} in ${file}`);
    seen.add(a.id);
  }
  return parsed.data;
}

// "$.a.items[0].name" -> ['$', 'a', 'items', '0', 'name']; "[*]" and "*" both become '*'
function split(path: string): string[] {
  return path.replace(/\[([^\]]*)\]/g, '.$1').split('.');
}

function pathMatches(pattern: string, path: string): boolean {
  const p = split(pattern);
  const s = split(path);
  return p.length === s.length && p.every((seg, i) => seg === '*' || seg === s[i]);
}

export function filterApproved(
  diffs: Difference[],
  suite: string,
  caseId: string,
  approved: ApprovedDifference[],
): { remaining: Difference[]; applied: string[] } {
  const relevant = approved.filter((a) => a.suite === suite && (a.caseId === '*' || a.caseId === caseId));
  const applied = new Set<string>();
  const remaining = diffs.filter((d) => {
    const hit = relevant.find((a) => pathMatches(a.path, d.path));
    if (hit) applied.add(hit.id);
    return !hit;
  });
  return { remaining, applied: relevant.filter((a) => applied.has(a.id)).map((a) => a.id) };
}
