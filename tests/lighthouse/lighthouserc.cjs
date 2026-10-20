// Lighthouse CI configuration. BASE_URL selects the app. The budgets are the ones
// asserted for the modern app (RISK-PERF-02); the legacy run only records scores.
const baseUrl = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

module.exports = {
  ci: {
    collect: {
      url: [`${baseUrl}/Default.aspx`, `${baseUrl}/Apply.aspx`],
      numberOfRuns: Number(process.env.LH_RUNS || 1),
      settings: {
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
      },
    },
  },
};
