import type { ManageClientConfig } from '../../../application/ports/in/manage-client-config.js';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import type { Option, Values } from './options.js';

/** Exit codes (docs/client.md#cli-for-agents). */
export const EXIT = { ok: 0, timeout: 1, bridge: 2, usage: 3 } as const;

export interface CliIo {
  /** The per-user settings behind `config` and the bridge URL. */
  config: ManageClientConfig;
  /** A client for the bridge at `url` (`--url`), or at the configured URL if `undefined`. */
  speech: (url: string | undefined) => SpeechCapture;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  version: string;
  /**
   * Takes over Ctrl+C for a command that runs until interrupted (`tail`): the returned signal
   * aborts on SIGINT / SIGTERM (and when stdout is closed) instead of the process exiting.
   */
  interrupt: () => AbortSignal;
}

/** One row of `--help`; `usage` is also printed when the positional arguments are wrong. */
export interface HelpLine {
  usage: string;
  description: readonly string[];
}

export interface Command {
  /** The options it takes besides the global ones. */
  options: readonly Option[];
  /** Its rows in `--help`, one per sub-command. */
  help: readonly HelpLine[];
  run: (args: string[], ctx: Context) => Promise<number>;
}

export interface Context {
  values: Values;
  json: boolean;
  io: CliIo;
  /** The bridge client, created on first use (`config` never needs one). */
  speech: () => SpeechCapture;
  /** Prints `json` with --json, `text` otherwise. */
  out: (json: unknown, text: string) => void;
}
