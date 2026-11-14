export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** The bridge configuration (docs/configuration.md). */
export interface ConfigDto {
  tcp: {
    host: string;
    port: number;
    format: 'text-to-socket';
    /** TextDecoder label of the code page the socket voice uses. */
    encoding: string;
    maxLineBytes: number;
  };
  http: {
    host: string;
    port: number;
    /** Host names accepted besides IPs, `localhost` and the machine's name. Added in API 1.5. */
    allowedHosts: string[];
  };
  playwright: { enabled: boolean; port: number; version: string | null };
  /** No version: the bridge runs the `@playwright/mcp` it depends on. */
  mcp: { enabled: boolean; port: number };
  input: { enabled: boolean };
  buffer: { maxEntries: number };
  log: { level: LogLevel; file: string | null; consoleSpeech: boolean };
}

/**
 * Answer of `GET` and `PUT /api/v1/config`: the configuration in use, plus the restart-only
 * settings saved with another value, which take effect on the next start. Added in API 1.6.
 */
export type ConfigResponseDto = ConfigDto & { restartRequired: string[] };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Body of `PUT /api/v1/config`: any subset of the configuration. */
export type ConfigPatchDto = DeepPartial<ConfigDto>;
