import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// The UI is a SvelteKit BFF: its server code calls the bridge API. `adapter-node` output
// (`build/handler.js`) is mounted by the bridge itself (docs/implementation/architecture.md#the-web-ui-a-sveltekit-bff).
export default defineConfig({
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
      // docs/usage/security.md#the-web-uis-content-security-policy. Scripts only from the UI itself
      // (SvelteKit adds a nonce for its own inline script, and `app.html`'s theme script carries
      // `%sveltekit.nonce%`); no page may frame the UI, so its delete and clear buttons can't be
      // clicked through a hidden frame. Styles stay open to inline ones: Svelte and @material/web
      // set `style` attributes.
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self'],
          'style-src': ['self', 'unsafe-inline'],
          'img-src': ['self', 'data:'],
          'font-src': ['self'],
          'connect-src': ['self'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'form-action': ['self'],
          'frame-ancestors': ['none'],
        },
      },
      // Remote functions (`*.remote.ts`) are still experimental in this Kit version
      // (docs/implementation/decisions.md#the-ui-uses-sveltekits-experimental-remote-functions).
      experimental: { remoteFunctions: true },
    }),
  ],
});
