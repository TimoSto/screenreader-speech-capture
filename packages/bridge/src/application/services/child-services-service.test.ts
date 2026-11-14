import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../test/fakes.js';
import type {
  ServiceName,
  ServiceSettings,
  ServiceState,
  ServiceStatus,
} from '../../domain/child-service.js';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type Config,
  type ConfigPatch,
} from '../../domain/config/index.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';
import { ChildServicesService } from './child-services-service.js';

/** A supervisor that records its calls; `start` settles when `settle()` is called. */
class FakeSupervisor implements ProcessSupervisor {
  readonly calls: string[] = [];
  state: ServiceState = 'stopped';
  failStop = false;
  failRestart = false;
  #settle: (() => void)[] = [];

  start(): Promise<void> {
    this.calls.push('start');
    return new Promise((resolve) => this.#settle.push(resolve));
  }
  stop(): Promise<void> {
    this.calls.push('stop');
    return this.failStop ? Promise.reject(new Error('cannot stop')) : Promise.resolve();
  }
  restart(): Promise<void> {
    this.calls.push('restart');
    return this.failRestart ? Promise.reject(new Error('cannot restart')) : new Promise(() => {});
  }
  reconfigure(settings: ServiceSettings): void {
    this.calls.push(`reconfigure ${settings.host}:${settings.port} ${settings.version}`);
  }
  status(): ServiceStatus {
    return { state: this.state, version: '1', port: 3000, restarts: 0, exitCode: null };
  }
  settle(): void {
    for (const resolve of this.#settle.splice(0)) resolve();
  }
}

const config = (patch: ConfigPatch = {}) => mergeConfig(DEFAULT_CONFIG, patch);

function setup(patch: ConfigPatch = {}) {
  let current: Config = config(patch);
  const supervisors: Record<ServiceName, FakeSupervisor> = {
    playwright: new FakeSupervisor(),
    mcp: new FakeSupervisor(),
  };
  const logger = new MemoryLogger();
  const services = new ChildServicesService({ supervisors, config: () => current, logger });
  return { services, supervisors, logger, use: (next: Config) => (current = next) };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ChildServicesService', () => {
  it('starts only the enabled services and resolves once they settled', async () => {
    const { services, supervisors } = setup({ mcp: { enabled: false } });
    let done = false;
    void services.startEnabled().then(() => (done = true));
    expect(supervisors.playwright.calls).toEqual(['start']);
    expect(supervisors.mcp.calls).toEqual([]);
    await flush();
    expect(done).toBe(false);
    supervisors.playwright.settle();
    await flush();
    expect(done).toBe(true);
  });

  it('leaves the services alone when their section did not change', async () => {
    const { services, supervisors } = setup();
    await services.apply(config({ buffer: { maxEntries: 5 } }), config());
    expect([...supervisors.playwright.calls, ...supervisors.mcp.calls]).toEqual([]);
  });

  it('reconfigures and restarts an enabled service, without waiting for the restart', async () => {
    const { services, supervisors } = setup();
    // The fake's restart never settles: `apply` must still resolve.
    await services.apply(config({ playwright: { port: 3100, version: '1.66.0' } }), config());
    expect(supervisors.playwright.calls).toEqual(['reconfigure 127.0.0.1:3100 1.66.0', 'restart']);
    expect(supervisors.mcp.calls).toEqual([]);
  });

  it('reconfigures and stops a disabled service', async () => {
    const { services, supervisors } = setup();
    await services.apply(config({ mcp: { enabled: false } }), config());
    expect(supervisors.mcp.calls).toEqual(['reconfigure 127.0.0.1:8931 null', 'stop']);
  });

  it('logs a failed restart or stop instead of rejecting', async () => {
    const { services, supervisors, logger } = setup();
    supervisors.playwright.failRestart = true;
    supervisors.mcp.failStop = true;
    await services.apply(config({ playwright: { port: 3100 }, mcp: { enabled: false } }), config());
    await flush();
    expect(logger.lines).toEqual(
      expect.arrayContaining([
        'error playwright restart failed: Error: cannot restart',
        'error mcp stop failed: Error: cannot stop',
      ]),
    );
  });

  it('stops all services, even if one fails, then rethrows', async () => {
    const { services, supervisors } = setup();
    supervisors.playwright.failStop = true;
    await expect(services.stopAll()).rejects.toThrow('cannot stop');
    expect(supervisors.mcp.calls).toEqual(['stop']);
  });

  it('tells where a service is reached, from the live config', () => {
    const { services, supervisors, use } = setup();
    supervisors.playwright.state = 'running';
    expect(services.reachability('playwright')).toEqual({ port: 3000 });
    expect(services.reachability('mcp')).toEqual({
      unavailable: 'Playwright MCP is not running (state: stopped)',
    });
    use(config({ mcp: { enabled: false } }));
    expect(services.reachability('mcp')).toEqual({ unavailable: 'Playwright MCP is disabled' });
  });
});
