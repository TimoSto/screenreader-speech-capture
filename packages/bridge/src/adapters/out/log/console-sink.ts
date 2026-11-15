import type { LogSink } from './bridge-log.js';

/**
 * Decides whether a console stream gets colours: `NO_COLOR` turns them off, `FORCE_COLOR`
 * turns them on, otherwise only on a terminal.
 */
export function wantsColour(isTTY: boolean | undefined, env: NodeJS.ProcessEnv): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') {
    return true;
  }
  return isTTY === true;
}

interface ConsoleSinkOptions {
  /** Also write the speech channel to the console. Off by default (feedback loop). */
  speech?: boolean;
  stream?: NodeJS.WriteStream;
  /** Where the text goes. Default: the stream. */
  write?: ((text: string) => void) | undefined;
  env?: NodeJS.ProcessEnv;
}

/** Console sink on stdout. */
export function consoleSink(options: ConsoleSinkOptions = {}): LogSink {
  const { speech = false, stream = process.stdout, env = process.env } = options;
  const write = options.write ?? ((text: string) => void stream.write(text));
  return {
    colour: wantsColour(stream.isTTY, env),
    speech,
    write: (line) => write(`${line}\n`),
  };
}
