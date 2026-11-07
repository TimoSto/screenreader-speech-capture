#!/usr/bin/env node
import packageJson from '../package.json' with { type: 'json' };
import { ListenError } from './adapters/in/tcp/tcp-listener.js';
import { fileSink } from './adapters/out/log/file-sink.js';
import { BridgeLog, consoleSink } from './adapters/out/log/log.js';
import { defaultLogFile } from './adapters/out/log/paths.js';
import { DEFAULT_CONFIG, mergeConfig, type Config } from './domain/config.js';
import { startBridge } from './main.js';

// Interim: a few environment variables until flags, all env vars and the config file land
// (docs/configuration.md, ROADMAP M1 lifecycle).
function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const port = env.SR_SPEECH_TCP_PORT;
  return mergeConfig(DEFAULT_CONFIG, {
    tcp: {
      port: port === undefined ? undefined : Number(port),
      encoding: env.SR_SPEECH_TCP_ENCODING,
    },
    log: {
      level: env.SR_SPEECH_LOG_LEVEL,
      file: env.SR_SPEECH_BRIDGE_LOG ?? defaultLogFile(),
      consoleSpeech: flag(env.SR_SPEECH_CONSOLE_SPEECH),
    },
  });
}

let config: Config;
try {
  config = configFromEnv(process.env);
} catch (error) {
  process.stderr.write(`screenreader-speech-capture: ${(error as Error).message}\n`);
  process.exit(2);
}
const log = new BridgeLog(config.log.level, [
  consoleSink({ speech: config.log.consoleSpeech }),
  ...(config.log.file === null ? [] : [fileSink(config.log.file)]),
]);

try {
  const bridge = await startBridge({ config, version: packageJson.version, log });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    bridge.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        log.for('bridge').error(`shutdown failed: ${String(error)}`);
        process.exit(1);
      },
    );
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, shutdown);
} catch (error) {
  const message = error instanceof ListenError ? error.message : String(error);
  log.for('bridge').error(message);
  process.exit(1);
}
