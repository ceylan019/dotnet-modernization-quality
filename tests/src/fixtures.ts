import { test as base, expect } from '@playwright/test';
import { GraphQLClient } from './api/graphql-client';
import { loadEnv, type TestEnv } from './config/env';
import { createLegacyDriver } from './drivers/legacy/index';
import { createModernDriver } from './drivers/modern/index';
import type { AppDriver } from './drivers/types';
import { CHANGES_DATA_PROJECT } from './run-order';

interface Fixtures {
  env: TestEnv;
  gql: GraphQLClient;
  consoleErrors: string[];
  app: AppDriver;
  singleWorkerGuard: void;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => {
    await use(loadEnv());
  },
  gql: async ({ request, env }, use) => {
    await use(new GraphQLClient(request, env.graphqlUrl));
  },
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await use(errors);
  },
  app: async ({ page, env }, use) => {
    await use(env.target === 'legacy' ? createLegacyDriver(page) : createModernDriver(page));
  },
  // Specs that change data rely on running after every read-only spec, which only one worker
  // guarantees. Refuse to change anything when the run was started with more workers.
  singleWorkerGuard: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      if (testInfo.project.name === CHANGES_DATA_PROJECT && testInfo.config.workers !== 1) {
        throw new Error(
          `${CHANGES_DATA_PROJECT} specs need workers: 1 (got ${testInfo.config.workers}), `
          + 'otherwise they can overlap read-only specs and change what those record or compare',
        );
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
