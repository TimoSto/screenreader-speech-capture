import type { ClientConfig, ClientConfigPatch } from '../../../domain/bridge-url.js';

/** Where the client's per-user settings live (driven port). */
export interface ClientConfigStore {
  /** Human-readable location, shown by `config path` and in errors. */
  readonly location: string;
  /** The stored settings, checked. Empty if nothing is stored yet. */
  load(): Promise<ClientConfig>;
  /** Applies a patch: a value sets the key, `undefined` removes it. */
  save(patch: ClientConfigPatch): Promise<void>;
}
