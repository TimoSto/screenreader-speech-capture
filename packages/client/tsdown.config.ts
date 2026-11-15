import { defineConfig, type UserConfig } from 'tsdown';

const common: UserConfig = {
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // Declarations only need `src`: the default tsconfig also includes the tests and makes the dts step ~3x slower.
  tsconfig: 'tsconfig.build.json',
  // `shared` is private and never published: bundle it into the client.
  // `valibot` comes in with `shared` (the API contract's schemas), so users don't install it.
  // Anything else that would end up in the bundle fails the build.
  deps: {
    alwaysBundle: [/^@screenreader-speech-capture\/shared/],
    onlyBundle: ['valibot'],
  },
};

export default defineConfig([
  {
    ...common,
    entry: { index: 'src/index.ts', cli: 'src/bin/cli.ts' },
    dts: false,
  },
  {
    ...common,
    // Type declarations for the library entry only (`exports.types`); the CLI is a bin and needs none.
    entry: { index: 'src/index.ts' },
    dts: { dtsOnly: true, tsc: { eager: true } },
    clean: false,
    // Fail the build when the package would be broken for consumers (missing types, bad exports).
    publint: { level: 'error' },
    attw: { profile: 'esm-only', level: 'error' },
  },
]);
