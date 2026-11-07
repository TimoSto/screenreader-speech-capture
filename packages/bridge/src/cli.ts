#!/usr/bin/env node
import packageJson from '../package.json' with { type: 'json' };
import { ListenError } from './adapters/in/tcp/tcp-listener.js';
import { BridgeLog, consoleSink } from './adapters/out/log/log.js';
import { DEFAULT_CONFIG } from './domain/config.js';
import { startBridge } from './main.js';

// Flags, environment variables and the config file follow in a later step (docs/ROADMAP.md, M1).
const config = DEFAULT_CONFIG;
const log = new BridgeLog(config.log.level, [consoleSink()]);

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
