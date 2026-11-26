/** What the BFF logs through: the bridge's `Logger` port, as far as the UI uses it. */
export interface ServerLog {
  error(message: string): void;
  warn(message: string): void;
}

/**
 * Where the bridge puts its `[web-ui]` logger before it loads the UI (`UI_LOGGER_KEY` in
 * `packages/bridge/src/composition/ui.ts`; the bridge and the UI don't import each other).
 */
const BRIDGE_LOGGER_KEY = Symbol.for('screenreader-speech-capture.ui-logger');

function isServerLog(value: unknown): value is ServerLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerLog).error === 'function' &&
    typeof (value as ServerLog).warn === 'function'
  );
}

/** `pnpm dev:ui` has no bridge in its process: the Vite dev server's console stands in. */
const consoleLog: ServerLog = {
  error: (message) => console.error(`[web-ui] ${message}`),
  warn: (message) => console.warn(`[web-ui] ${message}`),
};

/**
 * The bridge log inside the bridge, the console otherwise. Read per call, so it doesn't matter
 * whether this module loads before or after the bridge sets it.
 */
export function serverLog(): ServerLog {
  const bridge = (globalThis as Record<symbol, unknown>)[BRIDGE_LOGGER_KEY];
  return isServerLog(bridge) ? bridge : consoleLog;
}
