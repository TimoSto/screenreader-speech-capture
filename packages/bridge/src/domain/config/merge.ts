import { invalidField } from '../errors.js';
import type { Check } from './checks.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { configFields, fromFields } from './fields.js';
import { SCHEMA } from './schema.js';
import type { Config, ConfigPatch } from './types.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies a partial configuration to `base` and validates the result.
 * Throws `INVALID_REQUEST` naming the first invalid or unknown field (`details.field`).
 */
export function mergeConfig(base: Config, patch: unknown): Config {
  if (patch === undefined || patch === null) return base;
  if (!isPlainObject(patch)) throw invalidField('config', 'must be an object');

  const result: Record<string, Record<string, unknown>> = {};
  for (const section of Object.keys(base) as (keyof Config)[]) {
    result[section] = { ...base[section] };
  }

  for (const [section, values] of Object.entries(patch)) {
    const sectionSchema = (SCHEMA as Record<string, Record<string, Check>>)[section];
    if (sectionSchema === undefined) throw invalidField(section, 'unknown setting');
    if (values === undefined) continue;
    if (!isPlainObject(values)) throw invalidField(section, 'must be an object');

    for (const [key, value] of Object.entries(values)) {
      const field = `${section}.${key}`;
      const check = sectionSchema[key];
      if (check === undefined) throw invalidField(field, 'unknown setting');
      if (value === undefined) continue;
      const problem = check(value);
      if (problem !== undefined) throw invalidField(field, problem);
      result[section]![key] = value;
    }
  }

  return result as unknown as Config;
}

/**
 * Checks a partial configuration (a request body, the config file) like `mergeConfig` and
 * returns it without `undefined` values. Throws `INVALID_REQUEST` naming the field.
 */
export function validatePatch(patch: unknown): ConfigPatch {
  if (patch === undefined || patch === null) return {};
  mergeConfig(DEFAULT_CONFIG, patch);
  return fromFields(configFields(patch));
}

/** `patch` on top of `base`, both partial configurations (for the config file's content). */
export function mergePatch(base: ConfigPatch, patch: ConfigPatch): ConfigPatch {
  return fromFields(new Map([...configFields(base), ...configFields(patch)]));
}
