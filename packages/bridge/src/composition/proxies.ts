import { PLAYWRIGHT_MCP_PATH, PLAYWRIGHT_PATH } from '@screenreader-speech-capture/shared';
import type { ProxyRoute } from '../adapters/in/http/proxy/service-proxy.js';
import type { ChildServices } from '../application/ports/in/child-services.js';
import { SERVICE_TITLES } from '../domain/child-service.js';

/**
 * The child services' paths on the bridge's HTTP port (docs/playwright-mcp.md): the Playwright
 * server's WebSocket at `/`, MCP's streamable HTTP at `/mcp`.
 */
export function proxyRoutes(services: Pick<ChildServices, 'reachability'>): ProxyRoute[] {
  return [
    {
      name: SERVICE_TITLES.playwright,
      path: PLAYWRIGHT_PATH,
      upstreamPath: '/',
      scheme: 'ws',
      target: () => services.reachability('playwright'),
    },
    {
      name: SERVICE_TITLES.mcp,
      path: PLAYWRIGHT_MCP_PATH,
      upstreamPath: '/mcp',
      scheme: 'http',
      target: () => services.reachability('mcp'),
    },
  ];
}
