// Specs that create or change records, and the Playwright project that runs them. With one
// worker, tests run in project order, so these start only after every read-only spec has
// finished: searches, pages and their baselines see the seed alone, and two runs on a fresh
// seed send the same requests in the same order. (A teardown or dependency project would also
// order them, but runs unfiltered by --grep and file arguments, and a dependency is skipped
// when an earlier test fails.)
export const CHANGES_DATA_PROJECT = 'changes-data';

export const CHANGES_DATA_SPECS = [
  '**/api/workflow.spec.ts',
  '**/ui/apply.spec.ts',
  '**/ui/review.spec.ts',
];
