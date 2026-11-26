// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { BridgeApi } from '#lib/server/bridge-api.js';

declare global {
  namespace App {
    /** `field` names the setting a rejected config update is about (`tcp.port`). */
    interface Error {
      message: string;
      field?: string;
    }
    interface Locals {
      /** The page is opened on the bridge's machine, where the screen reader would read the log. */
      local: boolean;
      /** The bridge's HTTP API for this request (`hooks.server.ts`); the BFF's only way to it. */
      bridge: BridgeApi;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
