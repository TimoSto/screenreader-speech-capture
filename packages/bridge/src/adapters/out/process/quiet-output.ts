import type { Logger } from '../../../application/ports/out/logger.js';

/**
 * A `Logger` that sends the lines `isNoise` accepts to `debug` and everything else on unchanged.
 * `isNoise` may keep state, to drop a banner of several lines.
 */
export function quietOutput(output: Logger, isNoise: (line: string) => boolean): Logger {
  const through = (level: keyof Logger) => (line: string) =>
    isNoise(line) ? output.debug(line) : output[level](line);
  return {
    error: output.error.bind(output),
    warn: through('warn'),
    info: through('info'),
    debug: output.debug.bind(output),
  };
}

/** "Listening on <loopback URL>": the child's own port, which clients don't use. */
export const listeningLine = (line: string): boolean => /^Listening on /.test(line);

/**
 * The start banner of `@playwright/mcp`: "Listening on <loopback URL>", then a client config
 * snippet that names the child's own loopback port, not the bridge's URL
 * (docs/usage/playwright-mcp.md), up to the line about the legacy SSE transport.
 */
export function mcpBanner(): (line: string) => boolean {
  let inBanner = false;
  return (line) => {
    if (listeningLine(line)) inBanner = true;
    if (!inBanner) return false;
    if (/legacy SSE/i.test(line)) inBanner = false;
    return true;
  };
}
