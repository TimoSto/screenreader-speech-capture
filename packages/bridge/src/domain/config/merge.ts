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
    // `hasOwn`: a key like `valueOf` or `__proto__` must be unknown, not found on the prototype.
    if (!Object.hasOwn(SCHEMA, section)) throw invalidField(section, 'unknown setting');
    const sectionSchema = (SCHEMA as Record<string, Record<string, Check>>)[section]!;
    if (values === undefined) continue;
    if (!isPlainObject(values)) throw invalidField(section, 'must be an object');

    for (const [key, value] of Object.entries(values)) {
      const field = `${section}.${key}`;
      if (!Object.hasOwn(sectionSchema, key)) throw invalidField(field, 'unknown setting');
      const check = sectionSchema[key]!;
      if (value === undefined) continue;
      const problem = check(value);
      if (problem !== undefined) throw invalidField(field, problem);
      // Copied, so a later change to the caller's array can't change the config.
      result[section]![key] = Array.isArray(value) ? [...(value as unknown[])] : value;
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

/**
 * Throws `INVALID_REQUEST` if two listeners of `config` would use the same port: the bridge's TCP
 * and HTTP ports and the ports of the enabled child services. A port `0` (any free port) can't
 * collide. Checked on the final configuration only: a patch alone doesn't know the other ports.
 */
export function assertDistinctPorts(config: Config): void {
  const used = new Map<number, string>();
  const listeners: [string, number][] = [
    ['tcp.port', config.tcp.port],
    ['http.port', config.http.port],
  ];
  if (config.playwright.enabled) listeners.push(['playwright.port', config.playwright.port]);
  if (config.mcp.enabled) listeners.push(['mcp.port', config.mcp.port]);
  for (const [field, value] of listeners) {
    const other = used.get(value);
    if (value !== 0 && other !== undefined) {
      throw invalidField(field, `port ${value} is already used by ${other}`);
    }
    used.set(value, field);
  }
}
