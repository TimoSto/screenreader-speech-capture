import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/bin/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // Type declarations for the library entry (`exports.types`); `shared` is inlined like in the JS.
  dts: { tsc: { eager: true } },
  // Declarations only need `src`: the default tsconfig also includes the tests and makes the dts step ~3x slower.
  tsconfig: 'tsconfig.build.json',
  // Fail the build when the package would be broken for consumers (missing types, bad exports).
  publint: { level: 'error' },
  attw: { profile: 'esm-only', level: 'error' },
  // `shared` is private and never published: bundle it into the client.
  // `valibot` comes in with `shared` (the API contract's schemas), so users don't install it.
  // Anything else that would end up in the bundle fails the build.
  deps: {
    alwaysBundle: [/^@screenreader-speech-capture\/shared/],
    onlyBundle: ['valibot'],
  },
});
