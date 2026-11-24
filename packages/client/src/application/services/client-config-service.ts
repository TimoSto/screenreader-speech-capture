import { CONFIG_KEYS, parseConfigKey, type ConfigKey } from '../../domain/client-config.js';
import { overridesStored, pickValue } from '../../domain/config-value.js';
import type {
  ConfigValue,
  ExplicitValues,
  ManageClientConfig,
  SetResult,
} from '../ports/in/manage-client-config.js';
import type { ClientConfigStore } from '../ports/out/client-config-store.js';

interface ClientConfigServiceDeps {
  store: ClientConfigStore;
  /** The settings' environment variables (`SR_SPEECH_URL`, …), read once by the composition root. */
  env?: Partial<Record<ConfigKey, string | undefined>>;
}

export class ClientConfigService implements ManageClientConfig {
  constructor(private readonly deps: ClientConfigServiceDeps) {}

  get location(): string {
    return this.deps.store.location;
  }

  async get(key: string, explicit: ExplicitValues = {}): Promise<ConfigValue> {
    const k = parseConfigKey(key);
    const sources = { explicit: explicit[k], env: this.deps.env?.[k] };
    const resolved = overridesStored(sources)
      ? pickValue(CONFIG_KEYS[k], sources)
      : pickValue(CONFIG_KEYS[k], { ...sources, stored: (await this.deps.store.load())[k] });
    return { key: k, ...resolved };
  }

  list(explicit: ExplicitValues = {}): Promise<ConfigValue[]> {
    return Promise.all((Object.keys(CONFIG_KEYS) as ConfigKey[]).map((k) => this.get(k, explicit)));
  }

  async set(key: string, value: string): Promise<SetResult> {
    const k = parseConfigKey(key);
    const normalized = CONFIG_KEYS[k].normalize(value);
    await this.deps.store.save({ [k]: normalized });
    const shadowed = overridesStored({ env: this.deps.env?.[k] });
    return { key: k, value: normalized, ...(shadowed ? { shadowedBy: 'env' as const } : {}) };
  }

  async unset(key: string): Promise<{ key: ConfigKey }> {
    const k = parseConfigKey(key);
    await this.deps.store.save({ [k]: undefined });
    return { key: k };
  }
}
