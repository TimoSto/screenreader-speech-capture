import { describe, expect, it } from 'vitest';
import { start } from './helpers.js';

// The real UI is built by `pnpm build` (packages/ui). Here a stand-in handler shows how the
// bridge mounts it.
const uiDir = new URL('./fixtures/fake-ui/', import.meta.url);

describe('web UI', () => {
  it('is mounted on the HTTP port, with the BFF pointed at the bridge itself', async () => {
    const bridge = await start({}, { uiDir });
    const res = await fetch(`http://127.0.0.1:${bridge.httpPort}/live`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`ui GET /live api=http://127.0.0.1:${bridge.httpPort}`);
  });

  it('does not take the API', async () => {
    const bridge = await start({}, { uiDir });
    const res = await fetch(`http://127.0.0.1:${bridge.httpPort}/api/v1/status`);
    expect(await res.json()).toMatchObject({ bridge: { state: 'ready' } });
  });

  it('is off when there is no build of it', async () => {
    const bridge = await start({}, { uiDir: new URL('./fixtures/none/', import.meta.url) });
    expect((await fetch(`http://127.0.0.1:${bridge.httpPort}/`)).status).toBe(404);
  });
});
