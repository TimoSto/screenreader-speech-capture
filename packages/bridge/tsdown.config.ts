import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/bin/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // `shared` is private and never published: bundle it into the bridge.
  deps: { alwaysBundle: [/^@screenreader-speech-capture\/shared/] },
});
