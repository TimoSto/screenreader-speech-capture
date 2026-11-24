// The fixture's per-test session handling against a real bridge (no browser needed).
import { describe, expect, it } from 'vitest';
import { RecordingInputInjector } from '../../bridge/test/fakes.js';
import { send, start } from '../../bridge/test/helpers.js';
import { focusPage } from '../src/adapters/in/playwright/focus.js';
import {
  sessionName,
  withTestSession,
  type AttachMode,
  type TestInfoLike,
} from '../src/adapters/in/playwright/test-session.js';
import { SpeechCaptureClient } from '../src/main.js';

const env = { SR_SPEECH_CLIENT_CONFIG: '/nonexistent/client.json' };

async function setup() {
  const b = await start();
  const say = (...lines: string[]) => send(b.tcpPort, lines.map((l) => `${l}\r\n`).join(''));
  const client = new SpeechCaptureClient({ baseUrl: `http://127.0.0.1:${b.httpPort}`, env });
  return { say, client };
}

function testInfo(status: string, titlePath = ['a.spec.ts', 'suite', 'works']) {
  const attachments: { name: string; body: string }[] = [];
  const info: TestInfoLike = {
    titlePath,
    status,
    expectedStatus: 'passed',
    attach: (name, o) => {
      attachments.push({ name, body: o.body });
      return Promise.resolve();
    },
  };
  return { info, attachments };
}

describe('sessionName', () => {
  it('joins the title path', () => {
    expect(sessionName(['a.spec.ts', 'suite', 'works'])).toBe('a.spec.ts › suite › works');
  });
});

describe('withTestSession', () => {
  async function run(attach: AttachMode, status: string) {
    const { say, client } = await setup();
    const { info, attachments } = testInfo(status);
    await say('before');
    await withTestSession(client, info, { run: 'run 1', attach }, async () => {
      await say('Submit, button');
    });
    return { client, attachments };
  }

  it('runs the test in its own session and keeps the buffer', async () => {
    const { client } = await run('off', 'passed');
    const { sessions, currentId } = await client.sessions();
    expect(currentId).toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ name: 'a.spec.ts › suite › works', run: 'run 1' });
    const all = await client.getSpeech({ since: 0 });
    expect(all.map((e) => e.text)).toEqual(['before', 'Submit, button']);
  });

  it('attaches only the test session transcript', async () => {
    const { attachments } = await run('always', 'passed');
    expect(attachments).toEqual([{ name: 'speech-transcript', body: 'Submit, button' }]);
  });

  it('attaches on failure only when asked to', async () => {
    expect((await run('on-failure', 'passed')).attachments).toEqual([]);
    expect((await run('on-failure', 'failed')).attachments).toHaveLength(1);
  });

  it('ends the session and attaches when the test body throws', async () => {
    const { say, client } = await setup();
    const { info, attachments } = testInfo('failed');
    await expect(
      withTestSession(client, info, { run: 'r', attach: 'on-failure' }, async () => {
        await say('oops');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await client.sessions()).currentId).toBeNull();
    expect(attachments[0]?.body).toBe('oops');
  });
});

describe('focusPage', () => {
  it('sends a native click at the content corner to the bridge, then reloads', async () => {
    const inputInjector = new RecordingInputInjector();
    const b = await start({}, { inputInjector });
    const client = new SpeechCaptureClient({ baseUrl: `http://127.0.0.1:${b.httpPort}`, env });
    const page = {
      evaluate: () =>
        Promise.resolve({
          screenX: 100,
          screenY: 50,
          outerWidth: 1000,
          outerHeight: 800,
          innerWidth: 984,
          innerHeight: 700,
          devicePixelRatio: 1,
        }),
      reload: () => {
        inputInjector.calls.push('reload');
        return Promise.resolve();
      },
      bringToFront: () => {
        inputInjector.calls.push('page.bringToFront');
        return Promise.resolve();
      },
    };
    await focusPage(client, page);
    expect(inputInjector.calls).toEqual(['click left 109,143', 'reload']);
  });
});
