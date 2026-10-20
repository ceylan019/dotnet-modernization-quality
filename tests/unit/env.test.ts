import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = { TARGET: 'legacy', BASE_URL: 'http://localhost:8081' };

describe('loadEnv', () => {
  it('throws when TARGET is missing', () => {
    expect(() => loadEnv({ BASE_URL: 'http://localhost:8081' })).toThrow(/TARGET/);
  });

  it('throws when BASE_URL is missing', () => {
    expect(() => loadEnv({ TARGET: 'legacy' })).toThrow(/BASE_URL/);
  });

  it('rejects an unknown TARGET or TEST_STAGE', () => {
    expect(() => loadEnv({ ...base, TARGET: 'other' })).toThrow(/TARGET/);
    expect(() => loadEnv({ ...base, TEST_STAGE: 'moon' })).toThrow(/TEST_STAGE/);
  });

  it('refuses to record baselines from the modern app', () => {
    expect(() => loadEnv({ ...base, TARGET: 'modern', PARITY_MODE: 'record' })).toThrow(
      'Baselines can only be recorded from the legacy app',
    );
  });

  it('allows recording from legacy', () => {
    expect(loadEnv({ ...base, PARITY_MODE: 'record' }).parityMode).toBe('record');
  });

  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      stage: 'local',
      target: 'legacy',
      fixedToday: '2026-10-15',
      parityMode: 'compare',
    });
    expect(env.legacyDbUrl).toBeUndefined();
    expect(env.modernDbUrl).toBeUndefined();
  });

  it('derives graphqlUrl and tolerates a trailing slash', () => {
    expect(loadEnv(base).graphqlUrl).toBe('http://localhost:8081/graphql');
    expect(loadEnv({ ...base, BASE_URL: 'http://localhost:8081/' }).graphqlUrl).toBe(
      'http://localhost:8081/graphql',
    );
  });

  it('passes through database urls and overrides', () => {
    const env = loadEnv({
      ...base,
      TEST_STAGE: 'qa',
      FIXED_TODAY: '2027-01-02',
      LEGACY_DB_URL: 'a',
      MODERN_DB_URL: 'b',
    });
    expect(env).toMatchObject({ stage: 'qa', fixedToday: '2027-01-02', legacyDbUrl: 'a', modernDbUrl: 'b' });
  });
});
