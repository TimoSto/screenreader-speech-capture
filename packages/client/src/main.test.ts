import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpeechCaptureService } from './application/services/speech-capture-service.js';
import { createClientConfig, SpeechCaptureClient } from './main.js';

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

describe('SpeechCaptureClient', () => {
  it('wraps the service instead of exposing its internals', () => {
    const client = new SpeechCaptureClient({ baseUrl: 'http://localhost:1', env: {} });
    expect(client).not.toBeInstanceOf(SpeechCaptureService);
    expect(Object.keys(client)).toEqual([]);
    expect('deps' in client).toBe(false);
    expect('search' in client).toBe(false);
    expect(client.cursor()).toBe(0);
    client.setCursor(7);
    expect(client.cursor()).toBe(7);
  });
});
