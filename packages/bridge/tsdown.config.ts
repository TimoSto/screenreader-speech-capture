import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/bin/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // `shared` is private and never published: bundle it into the bridge.
  // `valibot` comes in with `shared` (the API contract's schemas), so users don't install it.
  // Anything else that would end up in the bundle fails the build.
  deps: {
    alwaysBundle: [/^@screenreader-speech-capture\/shared/],
    onlyBundle: ['valibot'],
  },
});
