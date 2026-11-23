#!/usr/bin/env node
import { hostname } from 'node:os';
import packageJson from '../../package.json' with { type: 'json' };
import { createClientConfig, SpeechCaptureClient } from '../main.js';
import { EXIT, runCli } from '../adapters/in/cli/run.js';

// `runCli` reports every error itself. Anything thrown outside it is a bug too, and must not end
// with Node's exit code 1, which means "timeout / no match".
const crash = (error: unknown) => {
  process.stderr.write(`Internal error, please report it: ${String(stackOf(error))}\n`);
  process.exit(EXIT.internal);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

process.exitCode = await runCli(process.argv.slice(2), {
  config: createClientConfig(process.env),
  // One name for every CLI call on this host: `session start` and `session end` are separate
  // processes of the same user.
  speech: (url) =>
    new SpeechCaptureClient({ baseUrl: url, env: process.env, clientName: `${hostname()} cli` }),
  input: (url) =>
    new SpeechCaptureClient({ baseUrl: url, env: process.env, clientName: `${hostname()} cli` }),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  version: packageJson.version,
  interrupt,
});

/** Ctrl+C, a kill or a closed stdout (`tail --json | head -3`) end the command normally. */
function interrupt(): AbortSignal {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
    stop();
  });
  return controller.signal;
}

function stackOf(error: unknown): unknown {
  return error instanceof Error ? (error.stack ?? error.message) : error;
}
