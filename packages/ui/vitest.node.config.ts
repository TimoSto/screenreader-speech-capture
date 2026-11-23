import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

// No SvelteKit plugin: it reads the project from the working directory, which is the repo root for
// `pnpm test`. The tested code (`src/lib/server`, the hooks) has no `$app` imports, and
// `$app/env/private` is a stub.
export default defineProject({
  resolve: {
    alias: {
      '$app/env/private': fileURLToPath(new URL('./src/test/app-env-private.ts', import.meta.url)),
    },
  },
  test: {
    name: 'ui',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.svelte.test.ts', 'node_modules/**'],
  },
});
