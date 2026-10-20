import { defineConfig } from 'vitest/config';

// Unit tests only: no database, no network, no .env. Stryker runs this config, so a mutation
// run can never reach the db/ tests, which need SQL Server and drop and recreate Permits.
export default defineConfig({
  test: {
    include: ['unit/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
