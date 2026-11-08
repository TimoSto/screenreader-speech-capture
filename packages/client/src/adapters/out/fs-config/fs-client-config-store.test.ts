import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientConfigError } from '../../../domain/bridge-url.js';
import { FsClientConfigStore } from './fs-client-config-store.js';

let dir: string;
let file: string;
let store: FsClientConfigStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-config-'));
  file = path.join(dir, 'nested', 'client.json');
  store = new FsClientConfigStore(file);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const writeFile = async (content: string) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};

describe('FsClientConfigStore', () => {
  it('treats a missing file as empty', async () => {
    expect(await store.load()).toEqual({});
  });

  it('round-trips, creates the directory and keeps unknown keys', async () => {
    await writeFile(JSON.stringify({ future: 1 }));
    await store.save({ url: 'http://vm:5151' });
    expect(await store.load()).toEqual({ url: 'http://vm:5151' });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({
      future: 1,
      url: 'http://vm:5151',
    });

    await store.save({ url: undefined });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ future: 1 });
    expect(await fs.readdir(path.dirname(file))).toEqual(['client.json']);
  });

  it('can overwrite an invalid stored url', async () => {
    await writeFile('{"url": "vm:5151"}');
    await expect(store.load()).rejects.toThrow(ClientConfigError);
    await store.save({ url: 'http://vm:5151' });
    expect(await store.load()).toEqual({ url: 'http://vm:5151' });
  });

  it.each([
    ['invalid JSON', '{'],
    ['a non-object', '[]'],
    ['an invalid url', '{"url": "vm:5151"}'],
  ])('rejects %s on load and names the file', async (_name, content) => {
    await writeFile(content);
    await expect(store.load()).rejects.toThrow(ClientConfigError);
    await expect(store.load()).rejects.toThrow(file);
  });

  it.each([
    ['invalid JSON', '{'],
    ['a non-object', '[]'],
  ])('refuses to save over %s', async (_name, content) => {
    await writeFile(content);
    await expect(store.save({ url: 'http://vm:1' })).rejects.toThrow(ClientConfigError);
    expect(await fs.readFile(file, 'utf8')).toBe(content);
  });
});
