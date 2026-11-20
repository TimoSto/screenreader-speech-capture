import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// The UI is a SvelteKit BFF: its server code calls the bridge API. `adapter-node` output
// (`build/handler.js`) is mounted by the bridge itself (docs/implementation/architecture.md#the-web-ui-a-sveltekit-bff).
export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    // `pnpm dev:ui`: the BFF reads `process.env`, which Vite doesn't fill from `.env*` files. Load
    // the `SR_` ones (e.g. `.env.local`, gitignored) so the dev server can call a bridge on the VM.
    // A variable set in the shell wins. The build and the bridge-mounted UI never read these files.
    const env = loadEnv(mode, import.meta.dirname, 'SR_');
    if (env.SR_BRIDGE_API_URL) process.env.SR_BRIDGE_API_URL ??= env.SR_BRIDGE_API_URL;
  }
  return {
    // The bridge ships `dist/ui` without a `node_modules`, so the server build must be
    // self-contained. adapter-node leaves `dependencies` external; bundle the ones the SSR code imports.
    ssr: { noExternal: ['@material/web'] },
    plugins: [
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        adapter: adapter(),
        // The bridge serves the UI under /ui; the API lives at /api/v1.
        paths: { base: '/ui' },
      }),
    ],
  };
});
