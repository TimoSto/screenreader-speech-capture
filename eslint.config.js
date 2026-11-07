// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Imports the inner hexagon layers must not use (see docs/architecture.md, dependency rule). */
const nodeBuiltins = {
  group: ['node:*'],
  message: 'The domain and application layers do no I/O. Put this in an adapter.',
};
const adapters = {
  group: ['**/adapters/**'],
  message: 'Only main.ts may know the concrete adapters (adapters → application → domain).',
};
const application = {
  group: ['**/application/**'],
  message: 'The domain imports nothing from the outer layers.',
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/bridge/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nodeBuiltins, adapters, application] }],
    },
  },
  {
    files: ['packages/bridge/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nodeBuiltins, adapters] }],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  prettier,
);
