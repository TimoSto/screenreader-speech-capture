import type { ValueSource } from '../../../domain/bridge-url.js';
import type { ConfigKey } from '../../../domain/client-config.js';

/** Values passed for this call only (`--url`, `baseUrl`). They win over everything else. */
export type ExplicitValues = Partial<Record<ConfigKey, string | undefined>>;

export interface ConfigValue {
  key: ConfigKey;
  /** The effective value. */
  value: string;
  source: ValueSource;
}

export interface SetResult {
  key: ConfigKey;
  /** The value as saved, normalised. */
  value: string;
  /** Set when a higher source hides the saved value (today: `SR_SPEECH_URL`). */
  shadowedBy?: 'env';
}

/** Read and change the client's per-user settings (docs/client.md#bridge-url). */
export interface ManageClientConfig {
  /** Where the settings are stored, for messages and `config path`. */
  readonly location: string;
  /**
   * The effective value and where it comes from. The store is only read when nothing with a
   * higher precedence is set. Rejects with `ClientConfigError` for an unknown key, an invalid
   * value or a broken store.
   */
  get(key: string, explicit?: ExplicitValues): Promise<ConfigValue>;
  /** {@link get} for every key. */
  list(explicit?: ExplicitValues): Promise<ConfigValue[]>;
  /** Checks, normalises and saves a value. */
  set(key: string, value: string): Promise<SetResult>;
  /** Removes a saved value. */
  unset(key: string): Promise<{ key: ConfigKey }>;
}
