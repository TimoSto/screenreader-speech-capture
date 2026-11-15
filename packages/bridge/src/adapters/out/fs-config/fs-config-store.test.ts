import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsConfigStore } from './fs-config-store.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-config-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('FsConfigStore', () => {
  it('loads nothing when there is no file yet', async () => {
    expect(await new FsConfigStore(path.join(dir, 'config.json')).load()).toBeUndefined();
  });

  it('saves into a new directory and loads it again, leaving no temporary file', async () => {
    const file = path.join(dir, 'nested', 'config.json');
    const store = new FsConfigStore(file);
    await store.save({ tcp: { port: 4450 } });
    expect(await store.load()).toEqual({ tcp: { port: 4450 } });
    expect(await fs.readFile(file, 'utf8')).toBe('{\n  "tcp": {\n    "port": 4450\n  }\n}\n');
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.json']);
  });

  it('names the file when it is not valid JSON', async () => {
    const file = path.join(dir, 'config.json');
    await fs.writeFile(file, '{ "tcp": ');
    await expect(new FsConfigStore(file).load()).rejects.toThrow(
      `The config file ${file} is not valid JSON`,
    );
  });

  it('reads a file with a byte order mark', async () => {
    const file = path.join(dir, 'config.json');
    await fs.writeFile(file, '\uFEFF{"tcp":{"port":4450}}');
    expect(await new FsConfigStore(file).load()).toEqual({ tcp: { port: 4450 } });
  });

  it('keeps the previous file as .bak and falls back on it when the file is empty', async () => {
    const file = path.join(dir, 'config.json');
    const store = new FsConfigStore(file);
    await store.save({ tcp: { port: 4450 } });
    await store.save({ tcp: { port: 4451 } });
    expect(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8'))).toEqual({ tcp: { port: 4450 } });
    await fs.writeFile(file, '');
    expect(await store.load()).toEqual({ tcp: { port: 4450 } });
  });

  it('does not replace a good .bak with a broken file', async () => {
    const file = path.join(dir, 'config.json');
    const store = new FsConfigStore(file);
    await store.save({ tcp: { port: 4450 } });
    await store.save({ tcp: { port: 4451 } });
    await fs.writeFile(file, '');
    await store.save({ tcp: { port: 4452 } });
    expect(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8'))).toEqual({ tcp: { port: 4450 } });
  });
});
