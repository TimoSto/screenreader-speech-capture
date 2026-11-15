import type http from 'node:http';

/**
 * Answers every request that is not the API or a proxied service: the web UI, a SvelteKit BFF
 * (docs/implementation/architecture.md#the-web-ui-a-sveltekit-bff). The composition root supplies
 * it; the HTTP adapter doesn't know SvelteKit.
 */
export type UiHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
