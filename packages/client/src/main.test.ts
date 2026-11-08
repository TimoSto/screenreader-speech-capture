import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClientConfig } from './main.js';

describe('createClientConfig (default wiring)', () => {
  it('reads SR_SPEECH_URL from the given env', async () => {
    expect(await createClientConfig({ SR_SPEECH_URL: 'http://env:1/' }).get('url')).toEqual({
      key: 'url',
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('stores in the file named by SR_SPEECH_CLIENT_CONFIG', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-main-'));
    try {
      const file = path.join(dir, 'client.json');
      const config = createClientConfig({ SR_SPEECH_CLIENT_CONFIG: file });
      expect(config.location).toBe(file);
      await config.set('url', 'http://from-file:1');
      expect(await config.get('url')).toMatchObject({
        value: 'http://from-file:1',
        source: 'config',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
