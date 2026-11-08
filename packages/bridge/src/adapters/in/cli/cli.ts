#!/usr/bin/env node
import packageJson from '../../../../package.json' with { type: 'json' };
import { ConfigError, startBridge } from '../../../main.js';
import { flushConsole, runUntilStopped } from './lifecycle.js';
import { helpText, parseCli, UsageError } from './options.js';

const fail = (message: string): never => {
  process.stderr.write(`screenreader-speech-capture: ${message}\n`);
  process.exit(2);
};

let options: ReturnType<typeof parseCli>;
try {
  options = parseCli(process.argv.slice(2), process.env);
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  options = fail(`${error.message}\nRun with --help to see the options.`);
}

if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}
if (options.version) {
  process.stdout.write(`${packageJson.version}\n`);
  process.exit(0);
}

// startBridge writes its own failures to the bridge log. An invalid setting is found before the
// log exists, so it goes to stderr.
try {
  await runUntilStopped(
    () =>
      startBridge({
        version: packageJson.version,
        overrides: options.overrides,
        overrideSources: options.sources,
        ...(options.configFile === undefined ? {} : { configFile: options.configFile }),
      }),
    process,
  );
} catch (error) {
  if (error instanceof ConfigError) fail(error.message);
  await flushConsole();
  process.exit(1);
}
