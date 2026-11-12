import { invalidField } from './errors.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];

/** The bridge configuration. Documented in docs/configuration.md. */
export interface Config {
  readonly tcp: {
    readonly host: string;
    readonly port: number;
    readonly format: 'text-to-socket';
    /** TextDecoder label of the code page the socket voice uses. */
    readonly encoding: string;
    readonly maxLineBytes: number;
  };
  readonly http: { readonly host: string; readonly port: number };
  readonly playwright: {
    readonly enabled: boolean;
    readonly port: number;
    readonly version: string | null;
  };
  readonly mcp: {
    readonly enabled: boolean;
    readonly port: number;
    readonly version: string | null;
  };
  readonly input: { readonly enabled: boolean };
  readonly buffer: { readonly maxEntries: number };
  readonly log: {
    readonly level: LogLevel;
    /** Bridge log file, `null` = default path. */
    readonly file: string | null;
    /** Also write the speech text to the console (feedback loop on the VM, see docs). */
    readonly consoleSpeech: boolean;
  };
}

export type ConfigPatch = { readonly [K in keyof Config]?: Partial<Config[K]> };

export const DEFAULT_CONFIG: Config = {
  tcp: {
    host: '127.0.0.1',
    port: 4449,
    format: 'text-to-socket',
    encoding: 'windows-1252',
    maxLineBytes: 65536,
  },
  http: { host: '0.0.0.0', port: 5151 },
  playwright: { enabled: true, port: 3000, version: null },
  mcp: { enabled: true, port: 8931, version: null },
  input: { enabled: true },
  buffer: { maxEntries: 10000 },
  log: { level: 'info', file: null, consoleSpeech: false },
};

/** Checks one value and returns an error message, or `undefined` if it is valid. */
type Check = (value: unknown) => string | undefined;

const integer =
  (min: number, max: number): Check =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
      ? undefined
      : `must be an integer from ${min} to ${max}`;
const port = integer(0, 65535);
const boolean: Check = (value) =>
  typeof value === 'boolean' ? undefined : 'must be true or false';
const nonEmptyString: Check = (value) =>
  typeof value === 'string' && value.trim() !== '' ? undefined : 'must be a non-empty string';
const nullableString: Check = (value) =>
  value === null ? undefined : nonEmptyString(value) && 'must be a non-empty string or null';
/**
 * An exact npm version (`1.56.1`, `1.57.0-beta-1`). `playwright.version` ends up on an
 * `npm install` command line, so nothing else may get through.
 */
export function isExactVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(value);
}
const nullableVersion: Check = (value) =>
  value === null || isExactVersion(value)
    ? undefined
    : 'must be an exact version like 1.56.1, or null';
const oneOf =
  (values: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && values.includes(value)
      ? undefined
      : `must be one of ${values.join(', ')}`;
const encoding: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';
  try {
    new TextDecoder(value);
    return undefined;
  } catch {
    return `unknown encoding "${value}"`;
  }
};

const SCHEMA: { readonly [S in keyof Config]: { readonly [K in keyof Config[S]]: Check } } = {
  tcp: {
    host: nonEmptyString,
    port,
    format: oneOf(['text-to-socket']),
    encoding,
    maxLineBytes: integer(1024, 16 * 1024 * 1024),
  },
  http: { host: nonEmptyString, port },
  playwright: { enabled: boolean, port, version: nullableVersion },
  mcp: { enabled: boolean, port, version: nullableString },
  input: { enabled: boolean },
  buffer: { maxEntries: integer(1, 1_000_000) },
  log: { level: oneOf(LOG_LEVELS), file: nullableString, consoleSpeech: boolean },
};

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

/** Names of the sections whose values differ between `a` and `b`. */
export function changedSections(a: Config, b: Config): (keyof Config)[] {
  return (Object.keys(a) as (keyof Config)[]).filter(
    (section) => JSON.stringify(a[section]) !== JSON.stringify(b[section]),
  );
}

/** One setting as `section.key`, for example `tcp.port`. */
export type ConfigField = `${string}.${string}`;

/** The settings in a (partial) configuration, as `section.key` → value. */
export function configFields(config: ConfigPatch): Map<ConfigField, unknown> {
  const fields = new Map<ConfigField, unknown>();
  for (const [section, values] of Object.entries(config)) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (value !== undefined) fields.set(`${section}.${key}`, value);
    }
  }
  return fields;
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

function fromFields(fields: Map<ConfigField, unknown>): ConfigPatch {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [field, value] of fields) {
    const [section, key] = field.split('.') as [string, string];
    (result[section] ??= {})[key] = value;
  }
  return result;
}

/** The settings whose values differ between `a` and `b`. */
export function changedFields(
  a: Config,
  b: Config,
): { field: ConfigField; from: unknown; to: unknown }[] {
  const before = configFields(a);
  return [...configFields(b)]
    .filter(([field, to]) => before.get(field) !== to)
    .map(([field, to]) => ({ field, from: before.get(field), to }));
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
