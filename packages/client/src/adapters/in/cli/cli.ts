#!/usr/bin/env node
import packageJson from '../../../../package.json' with { type: 'json' };
import { createClientConfig, SpeechCaptureClient } from '../../../main.js';
import { runCli } from './run.js';

process.exitCode = await runCli(process.argv.slice(2), {
  config: createClientConfig(process.env),
  speech: (url) => new SpeechCaptureClient({ baseUrl: url, env: process.env }),
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
