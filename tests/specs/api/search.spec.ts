import { SEARCH } from '../../src/api/operations';
import { apiTags, expectData, recording, runApiCase } from '../../src/api/parity-case';
import { loadCatalog } from '../../src/catalog';
import { expect, test } from '../../src/fixtures';

const SUITE = 'search';
const PAGE_SIZE = 20;

// Catalog terms plus accent and case probes from the risk register.
const TERMS = [...new Set([...loadCatalog().searchTerms, 'HÉLÈNE', 'cote', 'Côté'])];

// Status filters as the legacy schema spells them; null means no filter.
const FILTERS: { slug: string; status: string | null; risks: string[] }[] = [
  { slug: 'all', status: null, risks: [] },
  { slug: 'submitted', status: 'SUBMITTED', risks: ['RISK-DATE-03'] },
  { slug: 'expired', status: 'EXPIRED', risks: ['RISK-DATE-03'] },
];

// Readable and unique: the ASCII letters of the term, then what sets it apart from them.
function termSlug(term: string): string {
  if (term === '') return 'empty';
  const base = term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const marks: string[] = [];
  const hasLower = /\p{Ll}/u.test(term);
  const hasUpper = /\p{Lu}/u.test(term);
  if (hasUpper) marks.push(hasLower ? 'mixed' : 'upper');
  if (/[^\x20-\x7e]/.test(term)) marks.push('accent');
  if (term !== term.trim()) marks.push('space');
  return [base || 'symbols', ...marks].join('-');
}

// Terms whose case differs from the stored names, and terms that probe accent handling.
const CASE_PROBES = new Set(['tremblay', 'TREMBLAY', 'macdonald', 'HÉLÈNE']);
const ACCENT_PROBES = new Set(['Tremblé', 'cote', 'Côté', 'HÉLÈNE']);

function termRisks(term: string): string[] {
  const risks: string[] = [];
  if (CASE_PROBES.has(term)) risks.push('RISK-SEARCH-01');
  if (term !== term.trim()) risks.push('RISK-SEARCH-02');
  if (ACCENT_PROBES.has(term)) risks.push('RISK-SEARCH-03');
  return risks;
}

const slugs = new Map<string, string>();
for (const term of TERMS) {
  const slug = termSlug(term);
  const clash = slugs.get(slug);
  if (clash !== undefined) throw new Error(`Search terms ${JSON.stringify(clash)} and ${JSON.stringify(term)} share the case slug ${slug}`);
  slugs.set(slug, term);
}

interface Items { searchApplications: { totalCount: number; page: number; items: unknown[] } }

for (const term of TERMS) {
  for (const filter of FILTERS) {
    for (const page of [1, 2]) {
      const risks = ['RISK-ORDER-02', 'RISK-API-03', ...termRisks(term), ...filter.risks];
      const title = `search ${JSON.stringify(term)} status ${filter.status ?? 'any'} page ${page}`;
      test(title, { tag: apiTags(risks) }, async ({ gql }, testInfo) => {
        const res = await runApiCase(gql, testInfo, {
          suite: SUITE,
          caseId: `search-${termSlug(term)}-${filter.slug}-p${page}`,
          risks,
          query: SEARCH,
          variables: { searchText: term, status: filter.status, page, pageSize: PAGE_SIZE },
        });
        const data = expectData(res) as unknown as Items;
        expect(data.searchApplications.items.length, res.raw).toBeLessThanOrEqual(PAGE_SIZE);
      });
    }
  }
}

// The small seed has 74 effectively submitted applications, so page 5 is one past the end.
// Legacy counts with COUNT(*) OVER(), which reports 0 when the page holds no rows.
test('search page past the end', { tag: apiTags(['RISK-ORDER-02', 'RISK-API-03']) }, async ({ gql }, testInfo) => {
  const res = await runApiCase(gql, testInfo, {
    suite: SUITE,
    caseId: 'search-empty-submitted-p5-past-end',
    risks: ['RISK-ORDER-02', 'RISK-API-03'],
    query: SEARCH,
    variables: { searchText: '', status: 'SUBMITTED', page: 5, pageSize: PAGE_SIZE },
  });
  const data = expectData(res) as unknown as Items;
  // Checks the premise of the case against the seed while recording.
  if (recording()) expect(data.searchApplications.items, res.raw).toEqual([]);
});
