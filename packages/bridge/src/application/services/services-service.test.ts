import { describe, expect, it } from 'vitest';
import { FakeSupervisor } from '../../../test/fakes.js';
import { DEFAULT_CONFIG, mergeConfig, type Config } from '../../domain/config.js';
import { AppError } from '../../domain/errors.js';
import { ServicesService } from './services-service.js';

function setup(config: Config = DEFAULT_CONFIG) {
  const playwright = new FakeSupervisor();
  const services = new ServicesService({
    supervisors: new Map([['playwright', playwright]]),
    config: () => config,
  });
  return { services, playwright };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : 'not an AppError';
  }
  return undefined;
}

describe('ServicesService', () => {
  it('starts, stops and restarts a service and answers with its status', async () => {
    const { services, playwright } = setup();
    expect(await services.start('playwright')).toMatchObject({ state: 'running', port: 3000 });
    expect(await services.stop('playwright')).toMatchObject({ state: 'stopped' });
    expect(await services.restart('playwright')).toMatchObject({ state: 'running' });
    expect(playwright.calls).toEqual(['start', 'stop', 'restart']);
  });

  it('rejects unknown services with NOT_FOUND', async () => {
    const { services } = setup();
    expect(await codeOf(services.start('nope'))).toBe('NOT_FOUND');
    expect(await codeOf(services.stop('toString'))).toBe('NOT_FOUND');
  });

  it("doesn't start a disabled service, but stops it", async () => {
    const { services, playwright } = setup(
      mergeConfig(DEFAULT_CONFIG, { playwright: { enabled: false } }),
    );
    expect(await codeOf(services.start('playwright'))).toBe('SERVICE_UNAVAILABLE');
    expect(await codeOf(services.restart('playwright'))).toBe('SERVICE_UNAVAILABLE');
    expect(await codeOf(services.stop('playwright'))).toBeUndefined();
    expect(playwright.calls).toEqual(['stop']);
  });
});
