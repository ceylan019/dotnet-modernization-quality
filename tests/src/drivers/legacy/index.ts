import type { Page } from '@playwright/test';
import { category } from '../../catalog';
import type { AppDriver } from '../types';
import { LegacyApplyPage } from './apply';
import { LegacyDetailPage } from './detail';
import { LegacyReviewPage } from './review';
import { LegacySearchPage } from './search';

export function createLegacyDriver(page: Page): AppDriver {
  // A seeded record with several history rows, so detail and review show every element.
  const sample = category('multiStepHistory')[0]!;
  return {
    search: new LegacySearchPage(page),
    apply: new LegacyApplyPage(page),
    detail: new LegacyDetailPage(page),
    review: new LegacyReviewPage(page),
    pages: [
      { name: 'search', path: '/Default.aspx' },
      { name: 'apply', path: '/Apply.aspx' },
      { name: 'detail', path: `/Detail.aspx?ref=${sample}` },
      { name: 'review', path: `/Review.aspx?ref=${sample}` },
    ],
    errorProbes: [
      '/Detail.aspx?id=abc',
      '/Detail.aspx?id=99999999999',
      '/NoSuchPage.aspx',
    ],
  };
}
