export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];

/** The bridge configuration. Documented in docs/configuration.md. */
export interface Config {
  readonly tcp: {
    readonly host: string;
    readonly port: number;
    /** TextDecoder label of the code page the socket voice uses. */
    readonly encoding: string;
    readonly maxLineBytes: number;
  };
  readonly http: {
    readonly host: string;
    readonly port: number;
    /**
     * Host names the API answers to besides IP addresses, `localhost` and the machine's own name
     * (DNS rebinding protection, docs/security.md). `*` accepts any name.
     */
    readonly allowedHosts: readonly string[];
  };
  readonly playwright: {
    readonly enabled: boolean;
    readonly port: number;
    readonly version: string | null;
  };
  /** No version: the bridge runs the `@playwright/mcp` it depends on. */
  readonly mcp: {
    readonly enabled: boolean;
    readonly port: number;
  };
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

/**
 * One setting as `section.key`, for example `tcp.port`. Derived from `Config`, so a typo like
 * `tcp.prot` doesn't compile.
 */
export type ConfigField = {
  [S in keyof Config]: `${S}.${keyof Config[S] & string}`;
}[keyof Config];
