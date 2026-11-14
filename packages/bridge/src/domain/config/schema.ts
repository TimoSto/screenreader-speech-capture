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
      format: oneOf(['text-to-socket']),
      encoding,
      maxLineBytes: integer(1024, 16 * 1024 * 1024),
    },
    http: { host: nonEmptyString, port, allowedHosts: hostList },
    playwright: { enabled: boolean, port, version: nullableVersion },
    mcp: { enabled: boolean, port },
    input: { enabled: boolean },
    buffer: { maxEntries: integer(1, 1_000_000) },
    log: { level: oneOf(LOG_LEVELS), file: nullableString, consoleSpeech: boolean },
  };
