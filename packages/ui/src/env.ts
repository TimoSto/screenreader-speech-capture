import { defineEnvVars } from '@sveltejs/kit/env';

/** Where the BFF finds the bridge when `SR_BRIDGE_API_URL` is not set (`pnpm dev:ui` next to `pnpm dev`). */
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5151';

/**
 * The UI's environment, read when the app starts (`$app/env/private`). The bridge sets the
 * variables before it loads the UI; `pnpm dev:ui` also reads `packages/ui/.env.local` (SvelteKit
 * reads the `.env` files in dev only, and a variable set in the shell wins).
 */
export const variables = defineEnvVars({
  SR_BRIDGE_API_URL: {
    description: "The bridge's origin (no path) the BFF calls; default http://127.0.0.1:5151.",
    schema: (value) => {
      if (value === undefined || value === '') return DEFAULT_BRIDGE_URL;
      if (!URL.canParse(value)) throw new Error(`SR_BRIDGE_API_URL is not a URL: ${value}`);
      return value;
    },
  },
});
