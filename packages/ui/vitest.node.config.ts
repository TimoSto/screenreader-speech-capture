import { defineProject } from 'vitest/config';

// No SvelteKit plugin yet: the tested code (`src/lib/server`) has no `$app` imports, and the
// plugin reads the project from the working directory, which is the repo root for `pnpm test`.
export default defineProject({
  test: {
    name: 'ui',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.svelte.test.ts', 'node_modules/**'],
  },
});
