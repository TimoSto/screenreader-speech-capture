import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../test/fakes.js';
import type { ServiceName, ServiceState, ServiceStatus } from '../../domain/child-service.js';
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
  #settle: (() => void)[] = [];

  start(): Promise<void> {
    this.calls.push('start');
    return new Promise((resolve) => this.#settle.push(resolve));
  }
  stop(): Promise<void> {
    this.calls.push('stop');
    return this.failStop ? Promise.reject(new Error('cannot stop')) : Promise.resolve();
  }
  status(): ServiceStatus {
    return { state: this.state, version: '1', port: 3000, restarts: 0, exitCode: null };
  }
  pid(): number | null {
    return null;
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
