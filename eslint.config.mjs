// Flat ESLint config (ESLint 9). Type-aware linting via typescript-eslint's
// projectService, matching the conventions in CLAUDE.md: no `any`, no floating
// promises, explicit boundaries. See docs/adrs/0011 for the TypeScript version.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Not linted: build output, deps, coverage, and JS config files.
    ignores: ['dist/', 'node_modules/', 'coverage/', '**/*.js', '**/*.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md: never use `any`; prefer precise types / `unknown` at boundaries.
      '@typescript-eslint/no-explicit-any': 'error',
      // CLAUDE.md: no floating promises; prefer async/await.
      '@typescript-eslint/no-floating-promises': 'error',
      // CLAUDE.md: no non-null assertions to silence the compiler.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      // Allow intentionally-unused args/vars when prefixed with `_` (e.g. the
      // NotImplemented adapter stubs must satisfy the interface signature).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests: relax the type-aware boundary rules that make test doubles, HTTP
    // mocks, and supertest response bodies (typed `any` upstream) noisy.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
