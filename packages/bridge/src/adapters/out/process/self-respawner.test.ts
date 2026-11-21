import { describe, expect, it } from 'vitest';
import { canRespawn, NO_RESPAWN_ENV, type RespawnProcess } from './self-respawner.js';

const proc = (entry: string, env: NodeJS.ProcessEnv = {}): RespawnProcess => ({
  execPath: '/usr/bin/node',
  execArgv: [],
  argv: ['/usr/bin/node', entry],
  env,
});

describe('canRespawn', () => {
  it('accepts a bundled entry', () => {
    expect(canRespawn(proc('/app/dist/cli.mjs'))).toBe(true);
  });

  it('refuses a source file run by tsx', () => {
    expect(canRespawn(proc('/app/src/bin/cli.ts'))).toBe(false);
  });

  it('refuses when the environment turns it off', () => {
    expect(canRespawn(proc('/app/dist/cli.mjs', { [NO_RESPAWN_ENV]: '1' }))).toBe(false);
  });
});
