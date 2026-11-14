import { CONFIG_LIMITS } from '@screenreader-speech-capture/shared';
import {
  boolean,
  type Check,
  encoding,
  hostList,
  integer,
  nonEmptyString,
  nullableString,
  nullableVersion,
  oneOf,
  port,
} from './checks.js';
import { type Config, LOG_LEVELS } from './types.js';

/** The check for every setting. A setting missing here is rejected as unknown. */
export const SCHEMA: { readonly [S in keyof Config]: { readonly [K in keyof Config[S]]: Check } } =
  {
    tcp: {
      host: nonEmptyString,
      port,
      encoding,
      maxLineBytes: integer(CONFIG_LIMITS.maxLineBytes.min, CONFIG_LIMITS.maxLineBytes.max),
    },
    http: { host: nonEmptyString, port, allowedHosts: hostList },
    playwright: { enabled: boolean, port, version: nullableVersion },
    mcp: { enabled: boolean, port },
    buffer: { maxEntries: integer(CONFIG_LIMITS.maxEntries.min, CONFIG_LIMITS.maxEntries.max) },
    log: { level: oneOf(LOG_LEVELS), file: nullableString, consoleSpeech: boolean },
  };
