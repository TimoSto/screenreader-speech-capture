import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT, runCli } from './run.js';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-cli-'));
  file = path.join(dir, 'client.json');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    env: { SR_SPEECH_CLIENT_CONFIG: file, ...env },
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    version: '1.2.3',
  });
  return { code, stdout, stderr };
}

describe('config', () => {
  it('set → get → unset, with sources', async () => {
    expect((await run(['config', 'get', 'url', '--json'])).stdout).toBe(
      '{"key":"url","value":"http://localhost:5151","source":"default"}\n',
    );

    const set = await run(['config', 'set', 'url', 'http://my-vm:5151/']);
    expect(set.code).toBe(EXIT.ok);
    expect(set.stdout).toContain('http://my-vm:5151');
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ url: 'http://my-vm:5151' });

    expect(JSON.parse((await run(['config', 'get', 'url', '--json'])).stdout)).toMatchObject({
      value: 'http://my-vm:5151',
      source: 'config',
    });
    expect((await run(['config', 'get', 'url'])).stdout).toBe('http://my-vm:5151 (config file)\n');

    expect((await run(['config', 'unset', 'url'])).code).toBe(EXIT.ok);
    expect(JSON.parse((await run(['config', 'get', 'url', '--json'])).stdout)).toMatchObject({
      source: 'default',
    });
  });

  it('--url and SR_SPEECH_URL win over the file', async () => {
    await run(['config', 'set', 'url', 'http://file:1']);
    const env = { SR_SPEECH_URL: 'http://env:1' };
    expect((await run(['config', 'get', 'url'], env)).stdout).toBe(
      'http://env:1 (SR_SPEECH_URL)\n',
    );
    expect((await run(['config', 'get', 'url', '--url', 'http://flag:1'], env)).stdout).toBe(
      'http://flag:1 (--url)\n',
    );
  });

  it('warns when SR_SPEECH_URL hides the stored value', async () => {
    const { code, stderr } = await run(['config', 'set', 'url', 'http://file:1'], {
      SR_SPEECH_URL: 'http://env:1',
    });
    expect(code).toBe(EXIT.ok);
    expect(stderr).toContain('takes precedence');
  });

  it('list and path', async () => {
    expect((await run(['config', 'path'])).stdout).toBe(`${file}\n`);
    expect(JSON.parse((await run(['config', 'list', '--json'])).stdout)).toEqual({
      file,
      settings: [{ key: 'url', value: 'http://localhost:5151', source: 'default' }],
    });
  });

  it.each([
    [['config', 'set', 'url', 'my-vm:5151']],
    [['config', 'set', 'url']],
    [['config', 'set', 'colour', 'red']],
    [['config', 'frobnicate']],
    [['config']],
    [['nope']],
    [[]],
    [['--bogus']],
  ])('exits 3 for %j', async (args) => {
    const { code, stderr } = await run(args);
    expect(code).toBe(EXIT.usage);
    expect(stderr).not.toBe('');
  });

  it('exits 3 for a broken config file', async () => {
    await fs.writeFile(file, '{');
    const { code, stderr } = await run(['config', 'get', 'url']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain(file);
  });
});

it('--help and --version', async () => {
  expect((await run(['--help'])).stdout).toContain('config set url');
  expect((await run(['--version'])).stdout).toBe('1.2.3\n');
});
