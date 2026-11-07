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
const services = {
  group: ['**/application/services/**'],
  message: 'Adapters talk to the application through ports, not the concrete services.',
};
// Relative imports between adapters look like `../../out/...`, so match them with a regex.
const outAdapters = {
  regex: '(^|/)(\\.\\./out|adapters/out)/',
  message: 'Driving adapters must not import driven adapters. Wire them in main.ts.',
};
const inAdapters = {
  regex: '(^|/)(\\.\\./in|adapters/in)/',
  message: 'Driven adapters must not import driving adapters. Wire them in main.ts.',
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
    // Tests may wire real (in-memory) adapters; the rule is about production code.
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nodeBuiltins, adapters, application] }],
    },
  },
  {
    files: ['packages/bridge/src/application/**/*.ts'],
    // Tests may wire real (in-memory) adapters; the rule is about production code.
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nodeBuiltins, adapters] }],
    },
  },
  {
    files: ['packages/bridge/src/adapters/in/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [services, outAdapters] }],
    },
  },
  {
    files: ['packages/bridge/src/adapters/out/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [services, inAdapters] }],
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
