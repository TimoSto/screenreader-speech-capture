import type { ConfigStore } from '../application/ports/out/config-store.js';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  validatePatch,
  type ConfigField,
  type ConfigPatch,
} from '../domain/config/index.js';
import { AppError } from '../domain/errors.js';

/** A setting from flags, the environment or the config file is invalid. Nothing was started. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** `patch` checked, with an error that says where the bad setting came from. */
function checked(patch: unknown, origin: (field: string | undefined) => string): ConfigPatch {
  try {
    return validatePatch(patch);
  } catch (error) {
    const field = error instanceof AppError ? (error.details?.field as string) : undefined;
    throw new ConfigError(`${origin(field)}: ${(error as Error).message}`, { cause: error });
  }
}

/** Defaults, then the config file, then flags and environment variables. */
export async function loadConfig(
  store: ConfigStore,
  overridesPatch: unknown,
  sourceOf: (field: ConfigField) => string,
) {
  let saved: unknown;
  try {
    saved = await store.load();
  } catch (error) {
    throw new ConfigError((error as Error).message, { cause: error });
  }
  const file = checked(saved, () => `Invalid setting in the config file ${store.location}`);
  const overrides = checked(overridesPatch, (field) =>
    field?.includes('.') ? `Invalid ${sourceOf(field as ConfigField)}` : 'Invalid setting',
  );
  const config = mergeConfig(mergeConfig(DEFAULT_CONFIG, file), overrides);
  return { config, file, overrides };
}
