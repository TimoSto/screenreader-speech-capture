import type { ConfigField, ConfigPatch } from './types.js';

/** The settings in a (partial) configuration, as `section.key` → value. */
export function configFields(config: ConfigPatch): Map<ConfigField, unknown> {
  const fields = new Map<ConfigField, unknown>();
  for (const [section, values] of Object.entries(config)) {
    for (const [key, value] of Object.entries(values ?? {})) {
      // `ConfigPatch` only has known sections and keys, so this is a real setting.
      if (value !== undefined) fields.set(`${section}.${key}` as ConfigField, value);
    }
  }
  return fields;
}

/** The inverse of `configFields`: `section.key` → value back into sections. */
export function fromFields(fields: Map<ConfigField, unknown>): ConfigPatch {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [field, value] of fields) {
    const [section, key] = field.split('.') as [string, string];
    (result[section] ??= {})[key] = value;
  }
  return result;
}

/** The settings that `overrides` (flags, environment) sets although the config file has them. */
export function overriddenFields(
  file: ConfigPatch,
  overrides: ConfigPatch,
): { field: ConfigField; file: unknown; override: unknown }[] {
  const inFile = configFields(file);
  return [...configFields(overrides)]
    .filter(([field]) => inFile.has(field))
    .map(([field, override]) => ({ field, file: inFile.get(field), override }));
}
