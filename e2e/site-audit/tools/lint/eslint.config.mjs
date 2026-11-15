// ESLint for the suite. Lives in tools/lint/ with its own node_modules so typescript-eslint gets the
// TypeScript 5 API it needs (the suite itself type-checks with TypeScript 7). Run from the suite
// root: `npm run lint`.
import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';

const suiteRoot = fileURLToPath(new URL('../..', import.meta.url));

export default tseslint.config(
  { ignores: ['node_modules/**', 'tools/**', 'playwright-report/**', 'perf-report/**', 'test-results/**', 'reports/**', 'perf-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: suiteRoot },
    },
    rules: {
      // A forgotten await is a race against the live site.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Numbers in assertion messages are fine.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      // Non-null assertions right after expect(…).not.toBeNull() are idiomatic in tests.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // ANSI escape codes in reporter output are intentional.
      'no-control-regex': 'off',
      eqeqeq: ['error', 'always'],
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@playwright/test', importNames: ['test'], message: 'Import test from fixtures.ts: it installs the production write guard.' }] },
      ],
    },
  },
  {
    files: ['tests/**/*.spec.ts', 'perf/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      // Assertions live in helpers and loops on purpose (one test per page × check).
      'playwright/expect-expect': 'off',
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'off',
      // page-health must see every asset load and the view-counter tests must give beacons their chance: waiting for network quiet is the point there.
      'playwright/no-networkidle': 'off',
      // page.evaluate/exposeFunction observe page internals on purpose (submit-time button state, live config).
      'playwright/prefer-locator': 'off',
    },
  },
  {
    // The fixtures module and knownBugs.ts are where Playwright's base test is wrapped.
    files: ['fixtures.ts', 'knownBugs.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
