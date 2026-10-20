// @ts-check
import process from 'node:process';
import { resolve } from 'node:path';

// The sandbox is a copy of tests/ only, so tests that read ../docs need to be told where it is.
process.env.DOCS_DIR = resolve('../docs');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts', dir: '.' },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: ['src/parity/**/*.ts', 'src/gate/**/*.ts', 'src/api/**/*.ts'],
  ignoreStatic: false,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 85, break: 85 },
};
