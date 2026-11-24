// How one client setting is resolved from its sources (docs/usage/client.md#bridge-url,
// docs/usage/client.md#output-format).

/** Where the effective value came from, highest precedence first. */
export type ValueSource = 'explicit' | 'env' | 'config' | 'default';

export interface Resolved {
  value: string;
  source: ValueSource;
}

/** One setting: its environment variable, default and check. */
export interface Setting {
  env: string;
  default: string;
  /** Checks a value and returns it normalised; `origin` names it in the error. */
  normalize: (value: string, origin?: string) => string;
}

export interface ValueSources {
  /** Passed in code (`baseUrl`) or on the command line (`--url`, `--json`). */
  explicit?: string | undefined;
  /** Value of the setting's environment variable. */
  env?: string | undefined;
  /** The value from the config file (already checked). */
  stored?: string | undefined;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';

/** True if the stored value can't win, so the config file doesn't have to be read. */
export const overridesStored = (sources: ValueSources): boolean =>
  isSet(sources.explicit) || isSet(sources.env);

/** The value to use: explicit, then the environment variable, then the config file, then the default. */
export function pickValue(setting: Setting, sources: ValueSources): Resolved {
  if (isSet(sources.explicit)) {
    return { value: setting.normalize(sources.explicit), source: 'explicit' };
  }
  if (isSet(sources.env)) {
    return { value: setting.normalize(sources.env, setting.env), source: 'env' };
  }
  if (isSet(sources.stored)) return { value: sources.stored, source: 'config' };
  return { value: setting.default, source: 'default' };
}
