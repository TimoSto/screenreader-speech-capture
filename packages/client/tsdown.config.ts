import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/adapters/in/cli/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // `shared` is private and never published: bundle it into the client.
  deps: { alwaysBundle: [/^@screenreader-speech-capture\/shared/] },
});
