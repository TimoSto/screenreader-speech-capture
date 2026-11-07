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
  http: { host: string; port: number };
  playwright: { enabled: boolean; port: number; version: string | null };
  mcp: { enabled: boolean; port: number; version: string | null };
  input: { enabled: boolean };
  buffer: { maxEntries: number };
  log: { level: LogLevel; file: string | null; consoleSpeech: boolean };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Body of `PUT /api/v1/config`: any subset of the configuration. */
export type ConfigPatchDto = DeepPartial<ConfigDto>;
