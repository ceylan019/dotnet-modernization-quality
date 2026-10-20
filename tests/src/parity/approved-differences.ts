import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Difference } from './diff';

const schema = z.array(z.strictObject({
  id: z.string().min(1),
  suite: z.string().min(1),
  caseId: z.string().min(1),
  path: z.string().refine((p) => parsePath(p) !== undefined, 'must be a well formed path such as $.data.items[0].name'),
  reason: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  approvedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defect: z.string().min(1).optional(),
}));

export type ApprovedDifference = z.infer<typeof schema>[number];

export const DEFAULT_APPROVED_FILE = fileURLToPath(new URL('../../approved-differences.json', import.meta.url));

export function loadApprovedDifferences(file = DEFAULT_APPROVED_FILE): ApprovedDifference[] {
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

type Segment = { kind: 'key' | 'index'; value: string } | { kind: 'any' | 'anyIndex' };

// "$.a.items[0]["b.c"]" -> root '$', key a, key items, index 0, key b.c.
// "*" after a dot stands for any one segment, "[*]" for any one array index.
// Returns undefined when the path is not well formed.
function parsePath(path: string): Segment[] | undefined {
  const root = /^[^.[\]\s]+/.exec(path);
  if (!root) return undefined;
  const out: Segment[] = [{ kind: 'key', value: root[0] }];
  let rest = path.slice(root[0].length);
  while (rest.length > 0) {
    let m: RegExpExecArray | null;
    if ((m = /^\.([^.[\]]+)/.exec(rest))) {
      out.push(m[1] === '*' ? { kind: 'any' } : { kind: 'key', value: m[1]! });
    } else if ((m = /^\[(\d+)\]/.exec(rest))) {
      out.push({ kind: 'index', value: m[1]! });
    } else if ((m = /^\[\*\]/.exec(rest))) {
      out.push({ kind: 'anyIndex' });
    } else if ((m = /^\[("(?:[^"\\]|\\.)*")\]/.exec(rest))) {
      try {
        out.push({ kind: 'key', value: JSON.parse(m[1]!) as string });
      } catch {
        return undefined;
      }
    } else {
      return undefined;
    }
    rest = rest.slice(m[0].length);
  }
  return out;
}

function segmentMatches(pattern: Segment, actual: Segment): boolean {
  if (pattern.kind === 'any') return true;
  if (pattern.kind === 'anyIndex') return actual.kind === 'index';
  return actual.kind !== 'any' && actual.kind !== 'anyIndex' && pattern.kind === actual.kind && pattern.value === actual.value;
}

function pathMatches(pattern: string, path: string): boolean {
  const p = parsePath(pattern);
  const s = parsePath(path);
  return p !== undefined && s !== undefined && p.length === s.length && p.every((seg, i) => segmentMatches(seg, s[i]!));
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
