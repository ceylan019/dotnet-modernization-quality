import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const score = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const RiskSchema = z.strictObject({
  id: z.string().regex(/^RISK-[A-Z0-9]+-\d{2}$/, 'must look like RISK-AREA-01'),
  title: z.string().min(1),
  area: z.string().min(1),
  likelihood: score,
  impact: score,
  detection: z.string().min(1),
  stage: z.enum(['qa', 'staging', 'prod']),
  status: z.literal('open'),
});

const RegisterSchema = z
  .array(RiskSchema)
  .min(1, 'the register needs at least one risk')
  .superRefine((risks, ctx) => {
    const seen = new Set<string>();
    risks.forEach((risk, index) => {
      if (seen.has(risk.id)) {
        ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate risk ID ${risk.id}` });
      }
      seen.add(risk.id);
    });
  });

export type Risk = z.infer<typeof RiskSchema>;

export function parseRisks(data: unknown, source = 'risks'): Risk[] {
  const result = RegisterSchema.safeParse(data);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${where}${issue.message}`;
    });
    throw new Error(`Invalid risk register ${source}: ${problems.join('; ')}`);
  }
  return result.data;
}

// The default assumes the working directory is tests/, as for every npm script.
// DOCS_DIR overrides it for runs from a copy of tests/ (the Stryker sandbox).
export function docsPath(relative: string): string {
  return join(process.env.DOCS_DIR || '../docs', relative);
}

export function loadRisks(file = docsPath('quality/risks.json')): Risk[] {
  return parseRisks(JSON.parse(readFileSync(file, 'utf8')), file);
}
