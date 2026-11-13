/** A program to run, without a shell. */
export interface Command {
  readonly command: string;
  readonly args: readonly string[];
}

/** The settings with the version resolved (the configured one or the default). */
export interface ResolvedSettings {
  readonly host: string;
  readonly port: number;
  readonly version: string;
}

/**
 * Gets the service ready to run (for example installs it) and returns its command. A rejection
 * counts as a crash. `signal` aborts when the service is stopped meanwhile.
 */
export type Prepare = (settings: ResolvedSettings, signal: AbortSignal) => Promise<Command>;
