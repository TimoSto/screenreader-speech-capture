import {
  CONFIG_KEYS,
  overridesStored,
  parseConfigKey,
  pickBridgeUrl,
  type ConfigKey,
} from '../../domain/bridge-url.js';
import type {
  ConfigValue,
  ExplicitValues,
  ManageClientConfig,
  SetResult,
} from '../ports/in/manage-client-config.js';
import type { ClientConfigStore } from '../ports/out/client-config-store.js';

export interface ClientConfigServiceDeps {
  store: ClientConfigStore;
  /** Value of `SR_SPEECH_URL`, read once by the composition root. */
  envUrl?: string | undefined;
}

export class ClientConfigService implements ManageClientConfig {
  constructor(private readonly deps: ClientConfigServiceDeps) {}

  get location(): string {
    return this.deps.store.location;
  }

  async get(key: string, explicit: ExplicitValues = {}): Promise<ConfigValue> {
    const k = parseConfigKey(key);
    const sources = { explicit: explicit[k], env: this.deps.envUrl };
    const resolved = overridesStored(sources)
      ? pickBridgeUrl(sources)
      : pickBridgeUrl({ ...sources, stored: (await this.deps.store.load())[k] });
    return { key: k, ...resolved };
  }

  list(explicit: ExplicitValues = {}): Promise<ConfigValue[]> {
    return Promise.all((Object.keys(CONFIG_KEYS) as ConfigKey[]).map((k) => this.get(k, explicit)));
  }

  async set(key: string, value: string): Promise<SetResult> {
    const k = parseConfigKey(key);
    const normalized = CONFIG_KEYS[k](value);
    await this.deps.store.save({ [k]: normalized });
    const shadowed = overridesStored({ env: this.deps.envUrl });
    return { key: k, value: normalized, ...(shadowed ? { shadowedBy: 'env' as const } : {}) };
  }

  async unset(key: string): Promise<{ key: ConfigKey }> {
    const k = parseConfigKey(key);
    await this.deps.store.save({ [k]: undefined });
    return { key: k };
  }
}
