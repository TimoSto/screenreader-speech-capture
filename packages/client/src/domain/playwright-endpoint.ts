import { PLAYWRIGHT_PATH } from '@screenreader-speech-capture/shared';

/**
 * The WebSocket URL of the bridge's Playwright server for a (normalized) bridge URL:
 * `http://vm:5151` -> `ws://vm:5151/playwright` (docs/usage/playwright-mcp.md).
 */
export function playwrightEndpoint(bridgeUrl: string): string {
  const url = new URL(bridgeUrl);
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = url.pathname.replace(/\/+$/, '');
  return `${scheme}//${url.host}${base}${PLAYWRIGHT_PATH}`;
}
