import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

// Component tests run in real Chromium (Vitest browser mode), because the components use
// `@material/web` custom elements, which jsdom and happy-dom don't run faithfully.
// Needs the browser once: `pnpm exec playwright install chromium`.
export default defineProject({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  // SvelteKit's runtime isn't loaded here, so `$app/state` is a stub.
  resolve: {
    alias: { '$app/state': fileURLToPath(new URL('./src/test/app-state.ts', import.meta.url)) },
  },
  test: {
    name: 'ui-components',
    include: ['src/**/*.svelte.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
