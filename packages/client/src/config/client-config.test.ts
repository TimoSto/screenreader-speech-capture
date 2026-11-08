import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  readClientConfig,
  resolveBridgeUrl,
  writeClientConfig,
} from './client-config.js';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-config-'));
  file = path.join(dir, 'nested', 'client.json');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('normalizeBridgeUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeBridgeUrl(' http://vm:5151/ ')).toBe('http://vm:5151');
    expect(normalizeBridgeUrl('https://host/prefix//')).toBe('https://host/prefix');
  });

  it.each(['vm:5151', 'ftp://vm', 'not a url', 'http://vm:5151/?a=1', 'http://vm#x'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeBridgeUrl(input)).toThrow(ClientConfigError);
    },
  );
});

describe('readClientConfig / writeClientConfig', () => {
  it('treats a missing file as empty', async () => {
    expect(await readClientConfig(file)).toEqual({});
  });

  it('round-trips, creates the directory and keeps unknown keys', async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ future: 1 }));
    await writeClientConfig({ url: 'http://vm:5151' }, file);
    expect(await readClientConfig(file)).toEqual({ url: 'http://vm:5151' });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({
      future: 1,
      url: 'http://vm:5151',
    });

    await writeClientConfig({ url: undefined }, file);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ future: 1 });
    expect(await fs.readdir(path.dirname(file))).toEqual(['client.json']);
  });

  it.each([
    ['invalid JSON', '{'],
    ['a non-object', '[]'],
    ['a non-string url', '{"url": 5}'],
    ['an invalid url', '{"url": "vm:5151"}'],
  ])('rejects %s and names the file', async (_name, content) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    await expect(readClientConfig(file)).rejects.toThrow(ClientConfigError);
    await expect(readClientConfig(file)).rejects.toThrow(file);
  });
});

describe('resolveBridgeUrl', () => {
  beforeEach(async () => {
    await writeClientConfig({ url: 'http://from-config:1' }, file);
  });

  it('prefers the explicit value', async () => {
    expect(
      await resolveBridgeUrl({
        explicit: 'http://explicit:1/',
        env: { SR_SPEECH_URL: 'http://env:1' },
        file,
      }),
    ).toEqual({ value: 'http://explicit:1', source: 'explicit' });
  });

  it('then SR_SPEECH_URL', async () => {
    expect(await resolveBridgeUrl({ env: { SR_SPEECH_URL: 'http://env:1' }, file })).toEqual({
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('then the config file', async () => {
    expect(await resolveBridgeUrl({ env: {}, file })).toEqual({
      value: 'http://from-config:1',
      source: 'config',
    });
  });

  it('then the default', async () => {
    expect(await resolveBridgeUrl({ env: {}, file: path.join(dir, 'missing.json') })).toEqual({
      value: DEFAULT_BRIDGE_URL,
      source: 'default',
    });
  });

  it('finds the file through SR_SPEECH_CLIENT_CONFIG', async () => {
    expect(await resolveBridgeUrl({ env: { SR_SPEECH_CLIENT_CONFIG: file } })).toEqual({
      value: 'http://from-config:1',
      source: 'config',
    });
  });

  it('does not read the file when a higher source is set', async () => {
    await fs.writeFile(file, '{');
    expect((await resolveBridgeUrl({ env: { SR_SPEECH_URL: 'http://env:1' }, file })).source).toBe(
      'env',
    );
  });

  it('names SR_SPEECH_URL when it is invalid', async () => {
    await expect(resolveBridgeUrl({ env: { SR_SPEECH_URL: 'nope' }, file })).rejects.toThrow(
      /SR_SPEECH_URL/,
    );
  });
});
