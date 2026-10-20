// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts', dir: '.' },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: ['src/parity/**/*.ts', 'src/gate/**/*.ts'],
  ignoreStatic: false,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 85, break: 85 },
  // Gate tests read ../docs, which a sandbox copy of tests/ would not contain.
  inPlace: true,
};
