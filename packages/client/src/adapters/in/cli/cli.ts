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
});
