import type { VolatileKind } from '../parity/normalize';

export function uiTags(risks: readonly string[]): string[] {
  return ['@ui', '@parity', ...risks.map((r) => `@${r}`)];
}

// Values of an application created during the run, relative to `data` (see normalizeResponse).
export function newApplicationVolatile(root = 'application'): Record<string, VolatileKind> {
  return {
    [`${root}.referenceNumber`]: 'referenceNumber',
    [`${root}.submittedAt`]: 'timestamp',
    [`${root}.lastUpdatedAt`]: 'timestamp',
    [`${root}.history[*].changedAt`]: 'timestamp',
  };
}
