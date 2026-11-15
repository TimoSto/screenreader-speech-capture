import { existsSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// The web UI (`packages/ui`, a SvelteKit BFF built with adapter-node) ships inside the package as
// `dist/ui`; the bridge mounts its `handler.js` (src/composition/ui.ts). `pnpm -r` builds the UI
// first because the bridge depends on it.
const uiBuild = new URL('../ui/build', import.meta.url).pathname;
if (!existsSync(`${uiBuild}/handler.js`)) {
  throw new Error(`The web UI is not built (${uiBuild}/handler.js is missing): run \`pnpm build\``);
}

export default defineConfig({
  entry: { cli: 'src/bin/cli.ts' },
  format: 'esm',
  platform: 'node',
  copy: [{ from: '../ui/build', to: 'dist', rename: 'ui' }],
  target: 'node22',
  // `shared` is private and never published: bundle it into the bridge.
  // `valibot` comes in with `shared` (the API contract's schemas), so users don't install it.
  // Anything else that would end up in the bundle fails the build.
  deps: {
    alwaysBundle: [/^@screenreader-speech-capture\/shared/],
    onlyBundle: ['valibot'],
  },
});
