import { describe, expect, it, vi } from 'vitest';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import { eventually, start } from './helpers.js';

const post = (port: number) =>
  fetch(`http://127.0.0.1:${port}${API_PREFIX}/restart`, { method: 'POST' });

describe('restart API', () => {
  it('answers 202 first, then starts the restart', async () => {
    const requestRestart = vi.fn();
    const bridge = await start({}, { requestRestart });
    const res = await post(bridge.httpPort);
    expect(res.status).toBe(202);
    await eventually(
      () => requestRestart.mock.calls.length,
      (n) => n === 1,
    );
  });

  it('starts the restart once for repeated requests', async () => {
    const requestRestart = vi.fn();
    const bridge = await start({}, { requestRestart });
    await post(bridge.httpPort);
    await post(bridge.httpPort);
    expect(requestRestart).toHaveBeenCalledTimes(1);
  });

  it('answers 503 when the bridge cannot restart itself', async () => {
    const bridge = await start();
    const res = await post(bridge.httpPort);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});
