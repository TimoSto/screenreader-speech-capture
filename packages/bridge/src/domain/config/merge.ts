import { checkDto, ConfigPatchSchema } from '@screenreader-speech-capture/shared';
import { invalidField } from '../errors.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { configFields, fromFields } from './fields.js';
import type { Config, ConfigPatch } from './types.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies a partial configuration to `base` and validates it against the shared
 * `ConfigPatchSchema`, the only place that knows the rules.
 * Throws `INVALID_REQUEST` naming the first invalid or unknown field (`details.field`).
 */
export function mergeConfig(base: Config, patch: unknown): Config {
  if (patch === undefined || patch === null) return base;
  if (!isPlainObject(patch)) throw invalidField('config', 'must be an object');

  const checked = checkDto(ConfigPatchSchema, patch);
  if (!checked.ok) throw invalidField(checked.field, checked.message);

  const result: Record<string, Record<string, unknown>> = {};
  for (const section of Object.keys(base) as (keyof Config)[]) {
    result[section] = { ...base[section] };
  }
  for (const [field, value] of configFields(checked.value as ConfigPatch)) {
    const [section, key] = field.split('.') as [string, string];
    // Copied, so a later change to the caller's array can't change the config.
    result[section]![key] = Array.isArray(value) ? [...(value as unknown[])] : value;
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
