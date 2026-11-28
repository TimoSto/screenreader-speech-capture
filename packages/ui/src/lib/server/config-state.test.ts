import { describe, expect, it } from 'vitest';
import { configWith } from '../../test/config.js';
import type { BridgeApi } from './bridge-api.js';
import { readConfigState } from './config-state.js';

describe('readConfigState', () => {
  it('puts both views and the overrides together', async () => {
    const bridge = {
      config: (view: 'active' | 'saved') =>
        Promise.resolve(configWith({ tcp: { port: view === 'active' ? 4449 : 4450 } })),
      configOverrides: () => Promise.resolve({ overrides: { 'log.level': '--log-level' } }),
    } as unknown as BridgeApi;
    await expect(readConfigState(bridge)).resolves.toEqual({
      active: configWith(),
      saved: configWith({ tcp: { port: 4450 } }),
      overrides: { 'log.level': '--log-level' },
    });
  });
});
