import { PLAYWRIGHT_MCP_PATH, PLAYWRIGHT_PATH } from '@screenreader-speech-capture/shared';
import { describeAddress, reachableUrls } from '../adapters/shared/net/reachable-urls.js';
import type { ProcessSupervisor } from '../application/ports/out/process-supervisor.js';
import { SERVICE_TITLES, type ServiceName } from '../domain/child-service.js';
import type { Availability } from '../domain/availability.js';
import type { Config } from '../domain/config/index.js';
import type { Ports } from './lifecycle.js';

interface SummaryInput {
  config: Config;
  ports: Ports;
  supervisors: Readonly<Record<ServiceName, ProcessSupervisor>>;
  /** Whether the web UI is served on the HTTP port. */
  webUi: boolean;
  /** Off: the reason is logged when it loads. */
  nativeInput: Availability;
  /** Milliseconds from the start of the bridge until now. */
  tookMs: number;
}

const PATHS: Record<ServiceName, { path: string; scheme: 'http' | 'ws' }> = {
  playwright: { path: PLAYWRIGHT_PATH, scheme: 'ws' },
  mcp: { path: PLAYWRIGHT_MCP_PATH, scheme: 'http' },
};

/**
 * The block logged when the bridge is ready: what listens where, and which child services run.
 * It is the one place to look for the URLs to use and for a component that did not start
 * (docs/usage/operations.md#line-format).
 */
export function readySummary(input: SummaryInput): string {
  const { config, ports, supervisors } = input;
  const rows: [string, string][] = [
    ['speech capture', `${describeAddress(config.tcp.host, ports.tcp)} (${config.tcp.encoding})`],
    [
      input.webUi ? 'HTTP API + web UI' : 'HTTP API',
      reachableUrls('http', config.http.host, ports.http).join(', '),
    ],
  ];
  for (const name of Object.keys(PATHS) as ServiceName[]) {
    const { path, scheme } = PATHS[name];
    const { state, version } = supervisors[name].status();
    const urls = reachableUrls(scheme, config.http.host, ports.http)
      .map((url) => `${url}${path}`)
      .join(', ');
    let value: string;
    if (!config[name].enabled) value = 'off (disabled in the config)';
    else if (state === 'running') value = `${urls} (${version})`;
    else value = `${state.toUpperCase()}, see the log above (${version})`;
    rows.push([SERVICE_TITLES[name], value]);
  }
  rows.push(['native input', input.nativeInput.available ? input.nativeInput.backend : 'off']);
  const width = Math.max(...rows.map(([label]) => label.length));
  const seconds = (input.tookMs / 1000).toFixed(1);
  return [
    `ready in ${seconds}s`,
    ...rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`),
  ].join('\n');
}
