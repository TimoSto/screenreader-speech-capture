import type {
  ErrorBodyDto,
  SessionDto,
  SessionListDto,
  SpeechListDto,
  StatusDto,
  WaitResultDto,
} from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '../src/main.js';
import { eventually, send, start } from './helpers.js';

const api = (bridge: Bridge, path: string) => `http://127.0.0.1:${bridge.httpPort}/api/v1${path}`;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const post = (bridge: Bridge, path: string, body?: unknown) =>
  fetch(api(bridge, path), {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });

const startSession = async (bridge: Bridge, body: unknown) =>
  json<SessionDto>(await post(bridge, '/sessions', body));

/** Sends speech lines and waits until the bridge has recorded them. */
async function say(bridge: Bridge, ...lines: string[]) {
  const before = bridge.speech.list({ limit: 10_000 }).entries.length;
  await send(bridge.tcpPort, lines.map((line) => `${line}\r\n`).join(''));
  await eventually(
    () => bridge.speech.list({ limit: 10_000 }).entries.length,
    (count) => count === before + lines.length,
  );
}

const texts = async (bridge: Bridge, query: string) =>
  (await json<SpeechListDto>(await fetch(api(bridge, `/speech?${query}`)))).entries.map(
    (e) => e.text,
  );

describe('Sessions API', () => {
  it('starts, lists and ends sessions, and scopes reads to them', async () => {
    const bridge = await start();
    await say(bridge, 'before');

    const response = await post(bridge, '/sessions', { name: 'checkout', run: 'nightly-42' });
    expect(response.status).toBe(201);
    const first = await json<SessionDto>(response);
    expect(first).toEqual({
      id: 1,
      name: 'checkout',
      run: 'nightly-42',
      startedAt: expect.any(String) as string,
      endedAt: null,
      firstSeq: null,
      lastSeq: null,
      entries: 0,
    });
    await say(bridge, 'a1', 'a2');

    await startSession(bridge, { name: 'second' });
    await say(bridge, 'b1');

    expect(await texts(bridge, 'session=current')).toEqual(['b1']);
    expect(await texts(bridge, 'session=1')).toEqual(['a1', 'a2']);
    expect(await texts(bridge, '')).toEqual(['before', 'a1', 'a2', 'b1']);

    const list = await json<SessionListDto>(await fetch(api(bridge, '/sessions')));
    expect(list.currentId).toBe(2);
    expect(list.sessions.map((s) => [s.id, s.entries, s.firstSeq, s.lastSeq])).toEqual([
      [2, 1, 4, 4],
      [1, 2, 2, 3],
    ]);
    expect(list.sessions[1]!.endedAt).not.toBeNull();

    const ended = await post(bridge, '/sessions/end');
    expect(ended.status).toBe(204);
    await say(bridge, 'after');
    const all = await json<SpeechListDto>(await fetch(api(bridge, '/speech')));
    expect(all.entries.map((e) => e.sessionId)).toEqual([null, 1, 1, 2, null]);
    expect((await post(bridge, '/sessions/end')).status).toBe(204);

    const status = await json<StatusDto>(await fetch(api(bridge, '/status')));
    expect(status.session).toEqual({ current: null, count: 2 });
  });

  it('answers 404 for current without a session or an unknown id, on every read', async () => {
    const bridge = await start();
    for (const path of [
      '/speech?session=current',
      '/speech?session=3',
      '/speech/wait?contains=x&session=current',
      '/speech/stream?session=current',
    ]) {
      const response = await fetch(api(bridge, path));
      expect(response.status, path).toBe(404);
      expect((await json<ErrorBodyDto>(response)).error.code).toBe('NOT_FOUND');
    }
  });

  it('validates the start request', async () => {
    const bridge = await start();
    for (const [body, field] of [
      [{}, 'name'],
      [{ name: '  ' }, 'name'],
      [{ name: 'a', run: 5 }, 'run'],
    ] as const) {
      const response = await post(bridge, '/sessions', body);
      expect(response.status).toBe(400);
      expect((await json<ErrorBodyDto>(response)).error.details).toEqual({ field });
    }
    const noJson = await fetch(api(bridge, '/sessions'), { method: 'POST', body: '{}' });
    expect(noJson.status).toBe(400);
  });

  it('waits for speech of the current session only', async () => {
    const bridge = await start();
    await startSession(bridge, { name: 'a' });
    await say(bridge, 'Submit, button');
    await startSession(bridge, { name: 'b' });
    const result = await json<WaitResultDto>(
      await fetch(api(bridge, '/speech/wait?contains=Submit&session=current&timeoutMs=50')),
    );
    expect(result).toEqual({ matched: false, entries: [] });
  });

  it('reads, waits for and streams only the speech outside sessions with session=none', async () => {
    const bridge = await start();
    const controller = new AbortController();
    const stream = await fetch(api(bridge, '/speech/stream?session=none'), {
      signal: controller.signal,
    });
    let streamed = '';
    const reader = stream.body!.pipeThrough(new TextDecoderStream()).getReader();
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          streamed += value;
        }
      } catch {
        // aborted
      }
    })();

    await say(bridge, 'before');
    await startSession(bridge, { name: 'a' });
    await say(bridge, 'inside');
    await post(bridge, '/sessions/end');
    await say(bridge, 'after');

    expect(await texts(bridge, 'session=none')).toEqual(['before', 'after']);
    const wait = await json<WaitResultDto>(
      await fetch(api(bridge, '/speech/wait?contains=inside&session=none&timeoutMs=50')),
    );
    // Times out, having seen only the entries outside sessions.
    expect(wait.matched).toBe(false);
    expect(!wait.matched && wait.entries.map((e) => e.text)).toEqual(['before', 'after']);

    await eventually(
      () => streamed,
      (t) => t.includes('"text":"after"'),
    );
    controller.abort();
    expect(streamed).toContain('"text":"before"');
    expect(streamed).not.toContain('"text":"inside"');
  });

  it('streams session events, and only the entries of the selected session', async () => {
    const bridge = await start();
    await startSession(bridge, { name: 'a' });
    await say(bridge, 'a1');

    const controller = new AbortController();
    const response = await fetch(api(bridge, '/speech/stream?session=1'), {
      headers: { 'last-event-id': '0' },
      signal: controller.signal,
    });
    let text = '';
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          text += value;
        }
      } catch {
        // aborted
      }
    })();

    await startSession(bridge, { name: 'b' });
    await say(bridge, 'b1');
    await post(bridge, '/markers', { label: 'in b' });
    await eventually(
      () => text,
      (t) => (t.match(/event: session/g) ?? []).length === 2,
    );
    controller.abort();

    const frames = text
      .split('\n\n')
      .filter((frame) => frame.startsWith('id:') || frame.startsWith('event:'));
    expect(frames.map((frame) => frame.split('\n').find((l) => l.startsWith('event:')))).toEqual([
      'event: bridge',
      'event: entry',
      'event: session',
      'event: session',
    ]);
    expect(frames[1]).toContain('"text":"a1"');
    expect(frames[2]).not.toContain('id:');
    const ended = JSON.parse(frames[2]!.split('data: ')[1]!) as SessionDto;
    expect(ended).toMatchObject({ id: 1, entries: 1, endedAt: expect.any(String) as string });
  });

  it('DELETE /speech wipes the ended sessions and keeps the current one', async () => {
    const bridge = await start();
    await startSession(bridge, { name: 'a' });
    await say(bridge, 'a1');
    await startSession(bridge, { name: 'b' });
    await say(bridge, 'b1');
    await fetch(api(bridge, '/speech'), { method: 'DELETE' });
    const list = await json<SessionListDto>(await fetch(api(bridge, '/sessions')));
    expect(list).toMatchObject({ currentId: 2, sessions: [{ id: 2, entries: 0 }] });
    expect(await texts(bridge, 'session=1')).toEqual([]);
  });
});
