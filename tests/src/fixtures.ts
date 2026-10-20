import { test as base, expect } from '@playwright/test';
import { GraphQLClient } from './api/graphql-client';
import { loadEnv, type TestEnv } from './config/env';
import { createLegacyDriver } from './drivers/legacy/index';
import { createModernDriver } from './drivers/modern/index';
import type { AppDriver } from './drivers/types';

interface Fixtures {
  env: TestEnv;
  gql: GraphQLClient;
  consoleErrors: string[];
  app: AppDriver;
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
});

export { expect };
