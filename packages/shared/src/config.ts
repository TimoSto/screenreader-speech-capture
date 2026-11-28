import * as v from 'valibot';
import { CONFIG_LIMITS, EXACT_VERSION_PATTERN, HOST_NAME_PATTERN } from './limits.js';

/** A `TextDecoder` label other than UTF-16 (the framing splits the bytes on 0x0A first). */
function isSupportedEncoding(label: string): boolean {
  try {
    return !new TextDecoder(label).encoding.startsWith('utf-16');
  } catch {
    return false;
  }
}

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const range = ({ min, max }: { min: number; max: number }) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const port = range(CONFIG_LIMITS.port);
/** Port of a child service: `0` ("any free port") would leave the bridge no port to proxy to. */
const childPort = range({ min: 1, max: CONFIG_LIMITS.port.max });
const nonBlank = v.pipe(v.string(), v.regex(/\S/), v.description('Not empty or blank.'));

export const AllowedHostsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.regex(HOST_NAME_PATTERN))),
  v.description(
    "Host names the API answers to besides IP addresses, `localhost` and the machine's name. " +
      'Without port or scheme. `["*"]` accepts any name. Added in API 1.5.',
  ),
);

const playwrightVersion = v.pipe(
  v.nullable(v.pipe(v.string(), v.regex(EXACT_VERSION_PATTERN))),
  v.description('`null` = bundled version. Otherwise an exact version like `1.65.1`.'),
);

export const ServiceConfigSchema = v.object({
  enabled: v.boolean(),
  port: childPort,
  version: playwrightVersion,
});

export const McpConfigSchema = v.pipe(
  v.object({ enabled: v.boolean(), port: childPort }),
  v.description('No `version`: the bridge runs its bundled `@playwright/mcp`.'),
);

const sections = {
  tcp: {
    host: nonBlank,
    port,
    encoding: v.pipe(
      v.string(),
      v.check(isSupportedEncoding),
      v.description(
        "TextDecoder label of the socket voice's code page. Not `utf-16*`: lines are split on bytes.",
      ),
    ),
    maxLineBytes: range(CONFIG_LIMITS.maxLineBytes),
  },
  http: { host: nonBlank, port, allowedHosts: AllowedHostsSchema },
  buffer: { maxEntries: range(CONFIG_LIMITS.maxEntries) },
  log: {
    level: v.picklist(LOG_LEVELS),
    file: v.pipe(v.nullable(nonBlank), v.description('Bridge log file, `null` = default path.')),
    consoleSpeech: v.pipe(v.boolean(), v.description('Also write the speech text to the console.')),
  },
};

const configEntries = {
  tcp: v.object(sections.tcp),
  http: v.object(sections.http),
  playwright: ServiceConfigSchema,
  mcp: McpConfigSchema,
  buffer: v.object(sections.buffer),
  log: v.object(sections.log),
};

export const ConfigSchema = v.pipe(
  v.object(configEntries),
  v.description('The bridge configuration (docs/usage/configuration.md).'),
);

/** The bridge configuration (docs/usage/configuration.md). */
export type ConfigDto = v.InferOutput<typeof ConfigSchema>;

export const ConfigOverridesSchema = v.pipe(
  v.object({
    overrides: v.pipe(
      v.record(v.string(), v.string()),
      v.description(
        'Settings a flag or environment variable sets at startup, by their dotted path ' +
          '(`tcp.port`), with what sets each (`--tcp-port` or `SR_SPEECH_TCP_PORT`). They win ' +
          'over the config file on every start, so a saved value of them has no effect.',
      ),
    ),
  }),
  v.description('The settings the config file cannot change (`GET /config/overrides`).'),
);

export type ConfigOverridesDto = v.InferOutput<typeof ConfigOverridesSchema>;

/** A section with every setting optional and no others allowed. */
const patchOf = <T extends v.ObjectEntries>(entries: T) =>
  v.strictObject(
    Object.fromEntries(
      Object.entries(entries).map(([key, schema]) => [key, v.optional(schema)]),
    ) as {
      [K in keyof T]: v.OptionalSchema<T[K], undefined>;
    },
  );

export const ServiceConfigPatchSchema = patchOf(ServiceConfigSchema.entries);
export const McpConfigPatchSchema = patchOf({ enabled: v.boolean(), port: childPort });

export const ConfigPatchSchema = v.pipe(
  v.strictObject({
    tcp: v.optional(patchOf(sections.tcp)),
    http: v.optional(patchOf(sections.http)),
    playwright: v.optional(ServiceConfigPatchSchema),
    mcp: v.optional(McpConfigPatchSchema),
    buffer: v.optional(patchOf(sections.buffer)),
    log: v.optional(patchOf(sections.log)),
  }),
  v.description(
    'Any subset of `Config` (`PUT /config`). Settings left out keep their value; unknown ones ' +
      'are rejected. Ranges as in `Config`.',
  ),
);

/** Body of `PUT /api/v1/config`: any subset of the configuration. */
export type ConfigPatchDto = v.InferOutput<typeof ConfigPatchSchema>;
