import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['unit/**/*.test.ts', 'db/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
