/**
 * Whether a machine feature (native input, bringing windows to the front) works, as its adapter
 * reports it at start. `backend` names the library that does it; `reason` says why it is off.
 */
export type Availability =
  | { readonly available: true; readonly backend: string }
  | { readonly available: false; readonly reason: string };
