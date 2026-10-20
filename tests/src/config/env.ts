export type Target = 'legacy' | 'modern';
export type Stage = 'local' | 'dev' | 'qa' | 'staging' | 'prod';

export interface TestEnv {
  stage: Stage;
  target: Target;
  baseUrl: string;
  graphqlUrl: string;
  fixedToday: string;
  parityMode: 'compare' | 'record';
  legacyDbUrl?: string;
  modernDbUrl?: string;
}

const STAGES: readonly Stage[] = ['local', 'dev', 'qa', 'staging', 'prod'];
const TARGETS: readonly Target[] = ['legacy', 'modern'];

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')} (got "${value}")`);
  }
  return value as T;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): TestEnv {
  const targetRaw = source.TARGET;
  if (!targetRaw) throw new Error('TARGET is required (legacy or modern)');
  const baseRaw = source.BASE_URL;
  if (!baseRaw) throw new Error('BASE_URL is required, for example http://localhost:8081');

  const target = oneOf('TARGET', targetRaw, TARGETS);
  const stage = oneOf('TEST_STAGE', source.TEST_STAGE || 'local', STAGES);
  const parityMode = oneOf('PARITY_MODE', source.PARITY_MODE || 'compare', ['compare', 'record'] as const);
  if (parityMode === 'record' && target !== 'legacy') {
    throw new Error('Baselines can only be recorded from the legacy app');
  }

  const baseUrl = baseRaw.replace(/\/+$/, '');
  return {
    stage,
    target,
    baseUrl,
    graphqlUrl: `${baseUrl}/graphql`,
    fixedToday: source.FIXED_TODAY || '2026-10-15',
    parityMode,
    legacyDbUrl: source.LEGACY_DB_URL || undefined,
    modernDbUrl: source.MODERN_DB_URL || undefined,
  };
}
