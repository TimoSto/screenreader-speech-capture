import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBridgeUrl } from './index.js';

describe('resolveBridgeUrl (default wiring)', () => {
  it('reads SR_SPEECH_URL from the given env', async () => {
    expect(await resolveBridgeUrl({ env: { SR_SPEECH_URL: 'http://env:1/' } })).toEqual({
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('finds the config file through SR_SPEECH_CLIENT_CONFIG', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-index-'));
    try {
      const file = path.join(dir, 'client.json');
      await fs.writeFile(file, '{"url":"http://from-file:1"}');
      expect(await resolveBridgeUrl({ env: { SR_SPEECH_CLIENT_CONFIG: file } })).toEqual({
        value: 'http://from-file:1',
        source: 'config',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
