import type { SearchRow } from '../../src/drivers/types';
import { expect, test } from '../../src/fixtures';
import { expectParity } from '../../src/parity/expect-parity';
import { normalizeValues } from '../../src/parity/normalize';
import { uiTags } from '../../src/ui/ui-case';

const SUITE = 'ui-search';

// Rows show dates, money and permit type names as rendered, so every search also covers the
// culture (RISK-UI-02) and due date (RISK-DATE-01) of what the grid displays.
const SHOWN = ['RISK-UI-01', 'RISK-UI-02', 'RISK-DATE-01'];

const SEARCHES: { term: string; slug: string; pages: number[]; risks: string[] }[] = [
  // Stored as Tremblay, once with a trailing space (shown as `Tremblay , Louise`): the search
  // must ignore case and the row must keep the space.
  { term: 'tremblay', slug: 'tremblay', pages: [1], risks: ['RISK-SEARCH-01', 'RISK-SEARCH-02'] },
  // The mixedCaseNames records spell it MacDonald, macdonald and MACDONALD (and McDonald,
  // which must not match).
  { term: 'MacDonald', slug: 'macdonald-mixed', pages: [1], risks: ['RISK-SEARCH-01'] },
  // Every application of 2026: a full first page, and paging through the grid.
  { term: 'PRM-2026', slug: 'prm-2026', pages: [1, 2], risks: ['RISK-ORDER-02'] },
];

function rowsJson(rows: SearchRow[]) {
  return rows.map((r) => normalizeValues({ ...r }));
}

test('status filter options', { tag: uiTags(['RISK-UI-01']) }, async ({ app }, testInfo) => {
  await app.search.open();
  expectParity(testInfo, {
    suite: SUITE,
    caseId: 'status-options',
    risks: ['RISK-UI-01'],
    request: { page: 'search', read: 'status options' },
    actual: { options: await app.search.statusOptions() },
  });
});

for (const s of SEARCHES) {
  for (const n of s.pages) {
    const risks = [...SHOWN, ...s.risks];
    test(`search ${JSON.stringify(s.term)} page ${n}`, { tag: uiTags(risks) }, async ({ app, env }, testInfo) => {
      await app.search.open();
      await app.search.search(s.term);
      await app.search.goToPage(n);
      const rows = await app.search.rows();
      // Checks the premise of the case against the seed while recording.
      if (env.parityMode === 'record') expect(rows.length, 'rows shown').toBeGreaterThan(0);
      expectParity(testInfo, {
        suite: SUITE,
        caseId: `search-${s.slug}-p${n}`,
        risks,
        request: { page: 'search', text: s.term, status: null, resultsPage: n },
        actual: { count: await app.search.countText(), rows: rowsJson(rows) },
      });
    });
  }
}
