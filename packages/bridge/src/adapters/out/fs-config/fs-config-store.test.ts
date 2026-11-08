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
});
