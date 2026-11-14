// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Imports the inner hexagon layers must not use (see docs/implementation/architecture.md,
 * dependency rule).
 */
const nodeBuiltins = {
  // `platform-paths` is shared's Node-only entry (it reads the environment and the OS).
  group: ['node:*', '@screenreader-speech-capture/shared/platform-paths'],
  message: 'The domain and application layers do no I/O. Put this in an adapter.',
};
const adapters = {
  group: ['**/adapters/**'],
  message:
    'Only the composition root (main.ts, composition/) may know the concrete adapters (adapters → application → domain).',
};
const application = {
  group: ['**/application/**'],
  message: 'The domain imports nothing from the outer layers.',
};
const services = {
  group: ['**/application/services/**', '**/application/shared/**'],
  message: 'Adapters talk to the application through ports, not the services or their helpers.',
};
const compositionRoot = {
  group: ['**/main.js', '**/composition/**'],
  message:
    'Only the entry points in src/bin/ import the composition root; it wires the other layers, not the other way round.',
};
// Relative imports between adapters look like `../../out/...`, so match them with a regex.
const outAdapters = {
  regex: '(^|/)(\\.\\./out|adapters/out)/',
  message: 'Driving adapters must not import driven adapters. Wire them in the composition root.',
};
const inAdapters = {
  regex: '(^|/)(\\.\\./in|adapters/in)/',
  message: 'Driven adapters must not import driving adapters. Wire them in the composition root.',
};

/**
 * Ambient I/O and time the inner layers must not reach for: they get them through ports (the
 * `Clock` port for time and timers), so tests can replace them.
 */
const innerLayerGlobals = {
  'no-restricted-globals': [
    'error',
    ...[
      'setTimeout',
      'setInterval',
      'setImmediate',
      'clearTimeout',
      'clearInterval',
      'clearImmediate',
    ].map((name) => ({
      name,
      message: 'Use the Clock port (sleep) instead of the timer globals.',
    })),
    ...['process', 'fetch', 'performance'].map((name) => ({
      name,
      message: 'The domain and application layers do no I/O. Put this behind a port.',
    })),
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: 'Use the Clock port (now) for the current time.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Use the Clock port (now) for the current time.',
    },
  ],
};

/** Both hexagons (bridge and client) follow the same layout and rules. */
const hexagon = (layer) => `packages/{bridge,client}/src/${layer}/**/*.ts`;

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'packages/*/test/fixtures/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [hexagon('domain')],
    // Tests may wire real (in-memory) adapters; the rule is about production code.
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [nodeBuiltins, adapters, application, compositionRoot] },
      ],
      ...innerLayerGlobals,
    },
  },
  {
    files: [hexagon('application')],
    // Tests may wire real (in-memory) adapters; the rule is about production code.
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nodeBuiltins, adapters, compositionRoot] }],
      ...innerLayerGlobals,
    },
  },
  {
    // The public API goes index.ts → main.ts → adapters, so main.ts stays the one composition root.
    files: ['packages/client/src/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/adapters/**'],
              message: 'Export adapters through main.ts (the composition root).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [hexagon('adapters/in')],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [services, compositionRoot, outAdapters] }],
    },
  },
  {
    files: [hexagon('adapters/out')],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [services, compositionRoot, inAdapters] }],
    },
  },
  {
    // Helpers both sides may use (listen, reachable URLs). They import no other adapter.
    files: [hexagon('adapters/shared')],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [services, compositionRoot, inAdapters, outAdapters] },
      ],
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
