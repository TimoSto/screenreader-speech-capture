#!/usr/bin/env node
import packageJson from '../../../../package.json' with { type: 'json' };
import { defaultClientConfigStore } from '../../../index.js';
import { runCli } from './run.js';

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  store: defaultClientConfigStore(process.env),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  version: packageJson.version,
});
