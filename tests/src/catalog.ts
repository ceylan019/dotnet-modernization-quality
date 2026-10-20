import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const feeProbe = z.strictObject({
  permitTypeCode: z.string().min(1),
  areaSqM: z.string().regex(/^\d+\.\d{2}$/),
  isSenior: z.boolean(),
  isNonProfit: z.boolean(),
});

const catalogSchema = z.strictObject({
  fixedToday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.record(z.string(), z.array(z.string().regex(/^PRM-\d{4}-\d{6}$/)).min(1)),
  roundingHalfAreas: z.array(feeProbe).min(1),
  dueDateProbes: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  searchTerms: z.array(z.string()).min(1),
});

export type Catalog = z.infer<typeof catalogSchema>;
export type FeeProbe = z.infer<typeof feeProbe>;

// Resolved from this file, so specs read the same catalog whatever the working directory.
export const CATALOG_FILE = fileURLToPath(new URL('../seed-data/catalog.json', import.meta.url));

let cached: Catalog | undefined;

export function loadCatalog(): Catalog {
  if (!cached) {
    const parsed = catalogSchema.safeParse(JSON.parse(readFileSync(CATALOG_FILE, 'utf8')));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid seed catalog ${CATALOG_FILE}: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function category(name: string): string[] {
  const refs = loadCatalog().categories[name];
  if (!refs) throw new Error(`Seed catalog has no category "${name}"`);
  return refs;
}

// Active permit types from legacy/db/04-reference-data.sql, in the order the legacy API lists
// them. FENCE exists but is inactive.
export const ACTIVE_PERMIT_TYPES = ['DECK', 'DEMO', 'EVENT', 'PATIO', 'RENO', 'SIGN'] as const;
export const INACTIVE_PERMIT_TYPE = 'FENCE';
