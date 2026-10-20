import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', 'reports/**', 'allure-results/**', 'allure-report/**', 'seed-data/**', '.stryker-tmp/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
