// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
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
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
