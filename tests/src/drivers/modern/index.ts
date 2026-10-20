import type { Page } from '@playwright/test';
import type { AppDriver } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createModernDriver(page: Page): AppDriver {
  throw new Error('Modern UI driver is written after the conversion (Plan 2)');
}
