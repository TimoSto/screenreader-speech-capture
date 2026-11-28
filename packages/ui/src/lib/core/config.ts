import {
  CONFIG_LIMITS,
  EXACT_VERSION_PATTERN,
  type ConfigDto,
  type ConfigPatchDto,
} from '@screenreader-speech-capture/shared';

/** What the settings page knows about the bridge's configuration. */
export interface ConfigState {
  /** What runs now. It doesn't change while the bridge runs. */
  active: ConfigDto;
  /** What the next start will use: `active` with every saved update on top. */
  saved: ConfigDto;
  /**
   * Settings a flag or environment variable sets, by dotted path (`tcp.port`), with what sets each
   * (`--tcp-port`). They win over the config file, so saving them has no effect.
   */
  overrides: Readonly<Record<string, string>>;
}

/** Where the configuration comes from (the HTTP adapter asks the BFF, which asks the bridge). */
export interface ConfigApi {
  fetch(): Promise<ConfigState>;
  /** Saves a partial config for the next start. Rejects with a {@link SettingRejected} or an `Error`. */
  update(patch: ConfigPatchDto): Promise<ConfigDto>;
}

/** The bridge (or the BFF) refused a setting; `field` is its dotted path when it names one. */
export class SettingRejected extends Error {
  constructor(
    message: string,
    readonly field: string | undefined,
  ) {
    super(message);
    this.name = 'SettingRejected';
  }
}

function flatten(value: unknown, path: string, into: Map<string, string>): Map<string, string> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) {
      flatten(inner, path === '' ? key : `${path}.${key}`, into);
    }
  } else {
    into.set(path, JSON.stringify(value));
  }
  return into;
}

/**
 * The dotted paths of the settings whose saved value differs from the one in use: they wait for a
 * restart of the bridge.
 */
export function pendingFields(active: ConfigDto, saved: ConfigDto): string[] {
  const running = flatten(active, '', new Map());
  const next = flatten(saved, '', new Map());
  return [...next].filter(([path, value]) => running.get(path) !== value).map(([path]) => path);
}

export const PORT_MESSAGE = 'Enter a port from 1 to 65535.';

/**
 * Reads a port as typed. Only whole numbers from 1 to 65535: the API also takes 0 (a random
 * port), but a voice that has its port built in can't find that one.
 */
export function parsePort(
  text: string,
): { ok: true; port: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return { ok: false, message: PORT_MESSAGE };
  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? { ok: true, port } : { ok: false, message: PORT_MESSAGE };
}

export const PLAYWRIGHT_VERSION_MESSAGE =
  'Enter an exact version like 1.65.0, or leave the field empty.';

/** Reads a Playwright version as typed: an exact version, or empty for the bundled one (`null`). */
export function parsePlaywrightVersion(
  text: string,
): { ok: true; version: string | null } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, version: null };
  return EXACT_VERSION_PATTERN.test(trimmed)
    ? { ok: true, version: trimmed }
    : { ok: false, message: PLAYWRIGHT_VERSION_MESSAGE };
}

const { min: MIN_ENTRIES, max: MAX_ENTRIES } = CONFIG_LIMITS.maxEntries;

export const MAX_ENTRIES_MESSAGE = `Enter a whole number from ${MIN_ENTRIES} to ${MAX_ENTRIES}.`;

/** Reads the size of the speech buffer as typed: a whole number within the API's limits. */
export function parseMaxEntries(
  text: string,
): { ok: true; entries: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  const entries = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return entries >= MIN_ENTRIES && entries <= MAX_ENTRIES
    ? { ok: true, entries }
    : { ok: false, message: MAX_ENTRIES_MESSAGE };
}
