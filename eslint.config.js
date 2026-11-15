// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

// The architecture rules (see docs/implementation/architecture.md, dependency rule).

const SHARED = '@screenreader-speech-capture/shared';

/**
 * Inner layers (domain, application) may import only relative files and shared's root entry: no
 * Node built-ins (with or without the `node:` prefix), no npm package, no `platform-paths`.
 */
const onlyRelativeAndShared = {
  regex: `^(?!\\.{1,2}/|${SHARED}$)`,
  message:
    'The domain and application layers do no I/O and use no packages except shared. Put this in an adapter.',
};
/** Shared stays browser-safe (the UI imports it): no Node built-ins, with or without `node:`. */
const builtins = {
  group: ['node:*', ...builtinModules.flatMap((name) => [name, `${name}/*`])],
  message: 'shared is browser-safe. Node-only code belongs in platform-paths or openapi.',
};
const nodeOnlySharedFiles = {
  regex: '(^|/)(platform-paths|openapi)(/|\\.js$|$)',
  message: 'platform-paths and openapi are Node-only. Keep them out of the browser-safe files.',
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
// Ports are relative-imported from inside application, so the globs above don't see `../services/`.
const portsToServices = {
  regex: '(^|/)(services|shared)/',
  message: 'Ports are the contract of the services. They must not import the services or helpers.',
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
/** The bridge and the client are separate packages that only meet through shared (the HTTP API). */
const otherPackage = {
  bridge: {
    group: [
      '**/packages/client/**',
      'screenreader-speech-capture-client',
      'screenreader-speech-capture-client/*',
      '**/packages/ui/**',
      '@screenreader-speech-capture/ui',
    ],
    message:
      'The bridge must not import the client or the UI. They share only the contract in shared (the bridge mounts the UI build at run time).',
  },
  client: {
    group: [
      '**/packages/bridge/**',
      'screenreader-speech-capture',
      'screenreader-speech-capture/*',
    ],
    message: 'The client must not import the bridge. They share only the contract in shared.',
  },
};

/**
 * Ambient I/O and time the inner layers must not reach for: they get them through ports (the
 * `Clock` port for time and timers), so tests can replace them.
 */
/** @type {Record<string, [string, ...unknown[]]>} */
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
    ...['process', 'fetch', 'performance', 'console'].map((name) => ({
      name,
      message: 'The domain and application layers do no I/O. Put this behind a port (Logger).',
    })),
    {
      name: 'globalThis',
      message:
        'globalThis reaches the banned globals (timers, process, fetch, ...) by the back door.',
    },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: 'Use the Clock port (now) for the current time.' },
    {
      object: 'AbortSignal',
      property: 'timeout',
      message: 'Use the Clock port (sleep) for deadlines.',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Use the Clock port (now) for the current time.',
    },
    {
      selector: "CallExpression[callee.name='Date']",
      message: 'Use the Clock port (now) for the current time.',
    },
  ],
};
/** Browser-safe code: no Node-only globals. */
/** @type {Record<string, [string, ...unknown[]]>} */
const sharedGlobals = {
  'no-restricted-globals': [
    'error',
    ...['process', 'Buffer', '__dirname', '__filename'].map((name) => ({
      name,
      message: 'shared is browser-safe. Node-only code belongs in platform-paths or openapi.',
    })),
  ],
};

/**
 * `no-restricted-imports` of a later block replaces an earlier one, so every block states its
 * whole pattern list, including the other-package rule, one block per package.
 */
/** One block per package, so each gets its own other-package pattern. */
/**
 * @param {string} layer
 * @param {object[]} patterns
 * @param {Record<string, unknown>} [extra]
 * @returns {import('eslint').Linter.Config[]}
 */
const perPackage = (layer, patterns, extra = {}) =>
  ['bridge', 'client'].map((pkg) => ({
    files: [`packages/${pkg}/src/${layer}/**/*.ts`],
    // Tests may wire real (in-memory) adapters; the rules are about production code.
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...patterns, otherPackage[pkg]] }],
      ...extra,
    },
  }));

// The web UI (packages/ui): a BFF plus a hexagon-lite client layout
// (docs/implementation/architecture.md#the-web-ui-a-sveltekit-bff).
// Imports are written relative or as `#lib/...`; both forms match these globs.
const uiBase = [
  {
    group: [
      '**/packages/bridge/**',
      '**/packages/client/**',
      'screenreader-speech-capture',
      'screenreader-speech-capture/*',
      'screenreader-speech-capture-client',
      'screenreader-speech-capture-client/*',
    ],
    message: 'The UI talks to the bridge over HTTP. It shares only the contract in shared.',
  },
  {
    group: [`${SHARED}/platform-paths`],
    message: 'platform-paths is Node-only; the browser part of the UI must not import it.',
  },
];
const uiCoreImports = {
  regex: `^(?!\\.{1,2}/|#lib/core/|${SHARED}$)`,
  message:
    'lib/core is the UI model and its ports: only relative files, #lib/core and shared. No framework, no packages.',
};
const uiAdapters = {
  group: ['**/lib/adapters/**', '**/adapters/**'],
  message:
    'Only the composition file (lib/composition.ts) knows the concrete UI adapters. Depend on the ports in lib/core.',
};
const uiStores = {
  group: ['**/lib/stores/**', '**/stores/**'],
  message: 'lib/core and lib/adapters do not know the stores that sit on top of them.',
};
const uiComponents = {
  group: ['**/lib/components/**', '**/components/**', '**/*.svelte', '**/routes/**'],
  message: 'Components and routes sit on top of the stores. Lower layers must not import them.',
};
const uiServer = {
  group: ['**/lib/server/**', '**/server/**', '**/*.server.js', '**/*.server'],
  message: 'lib/server is the BFF and runs on the server only. Browser code reaches it over HTTP.',
};
const uiServerOnly = {
  group: ['**/lib/stores/**', '**/lib/components/**', '**/*.svelte', '**/lib/adapters/**'],
  message: 'The BFF (server code) does not import the browser-side layers.',
};
const uiSvelteKit = {
  group: ['svelte', 'svelte/*', '@sveltejs/*', '$app/*', '$env/*'],
  message: 'lib/core is framework-free so it can be tested without Svelte or SvelteKit.',
};

/** Ambient I/O the browser side must reach only through an adapter (components: through a store). */
const uiIoGlobals = ['fetch', 'EventSource', 'WebSocket', 'XMLHttpRequest'].map((name) => ({
  name,
  message: 'Components and stores do no I/O. Call a port; its adapter (lib/adapters) does the I/O.',
}));
/** @type {Record<string, [string, ...unknown[]]>} */
const uiNoIo = { 'no-restricted-globals': ['error', ...uiIoGlobals] };
/** @type {Record<string, [string, ...unknown[]]>} */
const uiCoreGlobals = {
  ...innerLayerGlobals,
  'no-restricted-globals': [
    ...innerLayerGlobals['no-restricted-globals'],
    ...uiIoGlobals,
    ...['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage'].map(
      (name) => ({
        name,
        message: 'lib/core is pure: browser APIs belong in an adapter behind a port.',
      }),
    ),
  ],
};

/**
 * One block per UI layer. `no-restricted-imports` of a later block replaces an earlier one, so every
 * block states `uiBase` plus its own patterns.
 * @param {string[]} files
 * @param {object[]} patterns
 * @param {Record<string, unknown>} [extra]
 * @returns {import('eslint').Linter.Config}
 */
const uiLayer = (files, patterns, extra = {}) => ({
  files,
  ignores: ['**/*.test.ts'],
  rules: { 'no-restricted-imports': ['error', { patterns: [...uiBase, ...patterns] }], ...extra },
});

/** @type {import('eslint').Linter.Config[]} */
const uiLayers = [
  // Anything else under the UI (hooks, composition.ts, ...): only the other-package rule.
  uiLayer(['packages/ui/src/**/*.{ts,svelte}'], []),
  uiLayer(
    ['packages/ui/src/lib/core/**/*.ts'],
    [uiCoreImports, uiAdapters, uiStores, uiComponents, uiServer, uiSvelteKit],
    uiCoreGlobals,
  ),
  uiLayer(['packages/ui/src/lib/adapters/**/*.ts'], [uiStores, uiComponents, uiServer]),
  uiLayer(['packages/ui/src/lib/stores/**/*.ts'], [uiAdapters, uiComponents, uiServer], uiNoIo),
  uiLayer(
    [
      'packages/ui/src/lib/components/**/*.{ts,svelte}',
      'packages/ui/src/routes/**/*.svelte',
      'packages/ui/src/routes/**/+{page,layout}.ts',
    ],
    [uiAdapters, uiServer],
    uiNoIo,
  ),
  uiLayer(
    ['packages/ui/src/lib/server/**/*.ts', 'packages/ui/src/routes/**/*.server.ts'],
    [uiServerOnly],
  ),
];

/** @type {import('eslint').Linter.Config[]} */
const architecture = [
  // Files outside the layers (main.ts, composition/, bin/): only the other-package rule.
  ...['bridge', 'client'].map((pkg) => ({
    files: [`packages/${pkg}/src/**/*.ts`],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [otherPackage[pkg]] }] },
  })),
  ...uiLayers,
  ...perPackage(
    'domain',
    [onlyRelativeAndShared, adapters, application, compositionRoot],
    innerLayerGlobals,
  ),
  ...perPackage(
    'application',
    [onlyRelativeAndShared, adapters, compositionRoot],
    innerLayerGlobals,
  ),
  ...perPackage(
    'application/ports',
    [onlyRelativeAndShared, adapters, compositionRoot, portsToServices],
    innerLayerGlobals,
  ),
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
            otherPackage.client,
          ],
        },
      ],
    },
  },
  ...perPackage('adapters/in', [services, compositionRoot, outAdapters]),
  ...perPackage('adapters/out', [services, compositionRoot, inAdapters]),
  // Helpers both sides may use (listen, reachable URLs). They import no other adapter.
  ...perPackage('adapters/shared', [services, compositionRoot, inAdapters, outAdapters]),
  {
    // shared is consumed by the UI too, so it stays free of Node built-ins. Its Node-only entries
    // (platform-paths, the OpenAPI generator) are the exception.
    files: ['packages/shared/src/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      'packages/shared/src/platform-paths.ts',
      'packages/shared/src/openapi/**',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [builtins, nodeOnlySharedFiles] }],
      ...sharedGlobals,
    },
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      // The web UI's build output (SvelteKit, adapter-node) and generated files.
      'packages/ui/build/**',
      '**/.svelte-kit/**',
      // Design reference (mockups, tokens), not app code.
      'docs/implementation/web-ui-design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'eslint.architecture.js',
            'packages/*/test/fixtures/*.mjs',
            'packages/*/test/fixtures/*/*.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  ...architecture,
  // The web UI (packages/ui): Svelte files, type-checked like the rest.
  ...svelte.configs['flat/recommended'],
  {
    // `*.svelte.ts` (stores with runes) goes through the Svelte parser too, so it needs the TS parser.
    files: ['packages/ui/**/*.svelte', 'packages/ui/**/*.svelte.ts'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] },
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
