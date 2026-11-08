import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ExplicitValues,
  ManageClientConfig,
} from '../../../application/ports/in/manage-client-config.js';
import { ClientConfigError } from '../../../domain/bridge-url.js';
import { createClientConfig } from '../../../main.js';
import { EXIT, runCli } from './run.js';

/** Records calls and returns canned answers, so only parsing and output are tested here. */
function fakeConfig(overrides: Partial<ManageClientConfig> = {}) {
  const calls: unknown[][] = [];
  const config: ManageClientConfig = {
    location: '/cfg/client.json',
    get: (key: string, explicit?: ExplicitValues) => {
      calls.push(['get', key, explicit]);
      return Promise.resolve({ key: 'url', value: 'http://vm:1', source: 'config' });
    },
    list: (explicit?: ExplicitValues) => {
      calls.push(['list', explicit]);
      return Promise.resolve([{ key: 'url', value: 'http://vm:1', source: 'env' }]);
    },
    set: (key: string, value: string) => {
      calls.push(['set', key, value]);
      return Promise.resolve({ key: 'url', value: 'http://vm:1' });
    },
    unset: (key: string) => {
      calls.push(['unset', key]);
      return Promise.resolve({ key: 'url' });
    },
    ...overrides,
  };
  return { config, calls };
}

async function run(args: string[], config: ManageClientConfig = fakeConfig().config) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    version: '1.2.3',
  });
  return { code, stdout, stderr };
}

describe('config', () => {
  it('get passes --url as the explicit value and prints the source', async () => {
    const { config, calls } = fakeConfig();
    expect(await run(['config', 'get', 'url', '--url', 'http://x:1'], config)).toEqual({
      code: EXIT.ok,
      stdout: 'http://vm:1 (config file)\n',
      stderr: '',
    });
    expect(calls).toEqual([['get', 'url', { url: 'http://x:1' }]]);
    expect((await run(['config', 'get', 'url', '--json'], config)).stdout).toBe(
      '{"key":"url","value":"http://vm:1","source":"config"}\n',
    );
  });

  it('set prints where it saved, and warns when the value is shadowed', async () => {
    const { config, calls } = fakeConfig();
    const plain = await run(['config', 'set', 'url', 'http://vm:1/'], config);
    expect(plain.stdout).toBe('Saved url = http://vm:1 to /cfg/client.json\n');
    expect(plain.stderr).toBe('');
    expect(calls).toEqual([['set', 'url', 'http://vm:1/']]);

    const shadowed = fakeConfig({
      set: () => Promise.resolve({ key: 'url', value: 'http://vm:1', shadowedBy: 'env' }),
    });
    const result = await run(['config', 'set', 'url', 'http://vm:1', '--json'], shadowed.config);
    expect(JSON.parse(result.stdout)).toEqual({
      key: 'url',
      value: 'http://vm:1',
      shadowedBy: 'env',
      file: '/cfg/client.json',
    });
    expect(result.stderr).toContain('SR_SPEECH_URL is set and takes precedence');
  });

  it('unset, list and path', async () => {
    expect((await run(['config', 'unset', 'url'])).stdout).toBe(
      'Removed url from /cfg/client.json\n',
    );
    expect((await run(['config', 'list'])).stdout).toBe(
      '# /cfg/client.json\nurl = http://vm:1 (SR_SPEECH_URL)\n',
    );
    expect(JSON.parse((await run(['config', 'list', '--json'])).stdout)).toEqual({
      file: '/cfg/client.json',
      settings: [{ key: 'url', value: 'http://vm:1', source: 'env' }],
    });
    expect((await run(['config', 'path'])).stdout).toBe('/cfg/client.json\n');
  });

  it('exits 3 with the message for a ClientConfigError', async () => {
    const { config } = fakeConfig({
      set: () => Promise.reject(new ClientConfigError('URL "x" is not a valid URL')),
    });
    const { code, stderr } = await run(['config', 'set', 'url', 'x'], config);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('URL "x" is not a valid URL');
  });

  it.each([
    [['config', 'set', 'url']],
    [['config', 'get']],
    [['config', 'path', 'extra']],
    [['config', 'frobnicate']],
    [['config']],
    [['nope']],
    [[]],
    [['--bogus']],
  ])('exits 3 for %j without touching the config', async (args) => {
    const { config, calls } = fakeConfig();
    const { code, stderr } = await run(args, config);
    expect(code).toBe(EXIT.usage);
    expect(stderr).not.toBe('');
    expect(calls).toEqual([]);
  });
});

it('--help and --version', async () => {
  expect((await run(['--help'])).stdout).toContain('config set url');
  expect((await run(['--version'])).stdout).toBe('1.2.3\n');
});

it('works end to end with the real config file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-cli-'));
  try {
    const file = path.join(dir, 'client.json');
    const config = () => createClientConfig({ SR_SPEECH_CLIENT_CONFIG: file });
    expect((await run(['config', 'set', 'url', 'http://my-vm:5151/'], config())).code).toBe(0);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ url: 'http://my-vm:5151' });
    expect((await run(['config', 'get', 'url'], config())).stdout).toBe(
      'http://my-vm:5151 (config file)\n',
    );
    expect((await run(['config', 'unset', 'url'], config())).code).toBe(0);
    expect((await run(['config', 'get', 'url'], config())).stdout).toBe(
      'http://localhost:5151 (default)\n',
    );

    await fs.writeFile(file, '{');
    const broken = await run(['config', 'get', 'url'], config());
    expect(broken.code).toBe(EXIT.usage);
    expect(broken.stderr).toContain(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
