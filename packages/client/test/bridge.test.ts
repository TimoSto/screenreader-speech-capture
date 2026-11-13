// The client against a real bridge (real TCP + HTTP sockets), fed like the socket voice.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { freePort, send, start } from '../../bridge/test/helpers.js';
import { EXIT, runCli } from '../src/adapters/in/cli/run.js';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from '../src/domain/errors.js';
import { createClientConfig, SpeechCaptureClient } from '../src/main.js';

/** No config file and no SR_SPEECH_URL from the developer's machine. */
const env = { SR_SPEECH_CLIENT_CONFIG: '/nonexistent/client.json' };

async function bridge() {
  const b = await start();
  const url = `http://127.0.0.1:${b.httpPort}`;
  return {
    url,
    tcpPort: b.tcpPort,
    say: (...lines: string[]) => send(b.tcpPort, lines.map((l) => `${l}\r\n`).join('')),
    client: () => new SpeechCaptureClient({ baseUrl: url, env }),
  };
}

async function cli(args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config: createClientConfig(env),
    speech: (url) => new SpeechCaptureClient({ baseUrl: url, env }),
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    version: '0.0.0',
    interrupt: () => new AbortController().signal,
  });
  return { code, stdout, stderr };
}

/** A server that answers every request with `status` and `body`. */
async function stub(status: number, body: string): Promise<string> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('library', () => {
  it('finds speech that arrived before the wait, then only newer speech', async () => {
    const { say, client } = await bridge();
    const sr = client();
    await sr.clear();
    await say('Submit, button', 'Name, edit, blank');
    expect(await sr.waitForOutput('Submit, button')).toMatchObject({ seq: 1, source: 'tcp' });
    expect(sr.cursor()).toBe(1);
    await expect(sr.waitForOutput('Submit', { timeout: 200 })).rejects.toThrow(SpeechTimeoutError);
    expect(await sr.getText()).toBe('Name, edit, blank');
  });

  it('marks, sequences, silence and record', async () => {
    const { say, client } = await bridge();
    const sr = client();
    await say('before');
    const marker = await sr.mark('step 1');
    await say('Dialog', 'noise', 'Close, button');
    const found = await sr.waitForSequence([/dialog/i, 'Close'], { since: marker.seq });
    expect(found.map((e) => e.text)).toEqual(['Dialog', 'Close, button']);
    await sr.waitForSilence({ quietFor: 100 });

    const { result, entries } = await sr.record(
      async () => {
        await say('Settings, heading level 2');
        return 'done';
      },
      { quietFor: 100 },
    );
    expect(result).toBe('done');
    expect(entries.map((e) => e.text)).toEqual(['Settings, heading level 2']);
  });

  it('clear resets the cursor while seq goes on', async () => {
    const { say, client } = await bridge();
    const sr = client();
    await say('one', 'two');
    await sr.waitForOutput('two');
    await sr.clear();
    expect(sr.cursor()).toBe(0);
    await say('three');
    expect(await sr.waitForOutput('three')).toMatchObject({ seq: 3 });
  });

  it('reports an unreachable bridge, HTTP errors and an incompatible bridge', async () => {
    const closed = `http://127.0.0.1:${await freePort()}`;
    await expect(new SpeechCaptureClient({ baseUrl: closed, env }).status()).rejects.toThrow(
      BridgeUnreachableError,
    );

    const failing = await stub(500, '{"error":{"code":"INTERNAL","message":"boom"}}');
    await expect(new SpeechCaptureClient({ baseUrl: failing, env }).status()).rejects.toThrow(
      new BridgeHttpError(500, 'INTERNAL', 'boom'),
    );
    const proxy = await stub(502, 'not json');
    await expect(new SpeechCaptureClient({ baseUrl: proxy, env }).status()).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
    });

    const v2 = await stub(200, JSON.stringify({ bridge: { apiVersion: '2.0' } }));
    await expect(new SpeechCaptureClient({ baseUrl: v2, env }).getSpeech()).rejects.toThrow(
      IncompatibleBridgeError,
    );
    const v12 = await stub(200, JSON.stringify({ bridge: { apiVersion: '1.2' } }));
    await expect(new SpeechCaptureClient({ baseUrl: v12, env }).status()).rejects.toThrow(
      'Clients of this version need a bridge with API 1.3 or newer, this one speaks API 1.2',
    );
  });
});

describe('sessions', () => {
  it('startSession scopes the cursor; entries carry the sessionId; sessions lists them', async () => {
    const { say, client } = await bridge();
    const sr = client();
    await say('earlier test');
    await sr.waitForOutput('earlier');
    const session = await sr.startSession('checkout', { run: 'nightly' });
    expect(session).toMatchObject({ name: 'checkout', run: 'nightly', endedAt: null });
    await say('Submit, button');
    expect(await sr.waitForOutput('Submit')).toMatchObject({ sessionId: session.id });
    expect(await sr.getText({ since: 0, session: 'current' })).toBe('Submit, button');
    await sr.endSession();
    expect(await sr.sessions()).toMatchObject({
      currentId: null,
      sessions: [{ id: session.id, entries: 1, endedAt: expect.any(String) as unknown }],
    });
    await expect(sr.getSpeech({ session: 'current' })).rejects.toMatchObject({ status: 404 });
  });

  it('onSpeech reports sessions over SSE', async () => {
    const { client } = await bridge();
    const sr = client();
    const log: string[] = [];
    const stop = sr.onSpeech(() => undefined, {
      onSession: (s) => log.push(`${s.name} ${s.endedAt === null ? 'started' : 'ended'}`),
    });
    onTestFinished(stop);
    await vi.waitFor(async () => {
      await sr.startSession('probe');
      expect(log.length).toBeGreaterThan(0);
    });
    log.length = 0;
    await sr.startSession('next');
    await vi.waitFor(() => expect(log).toEqual(['probe ended', 'next started']));
  });
});

describe('onSpeech', () => {
  it('delivers live speech, markers and clears over SSE', async () => {
    const { say, client, tcpPort } = await bridge();
    const sr = client();
    await say('before');
    const log: string[] = [];
    const errors: Error[] = [];
    const stop = sr.onSpeech((e) => log.push(`${e.seq} ${e.kind} ${e.text}`), {
      includeMarkers: true,
      onClear: () => log.push('clear'),
      onError: (error) => errors.push(error),
    });
    onTestFinished(stop);
    // Only new speech: wait until the feed is connected before speaking.
    await vi.waitFor(async () => {
      await sr.mark('ping');
      expect(log.length).toBeGreaterThan(0);
    });
    log.length = 0;
    await say('Submit, button');
    await sr.clear();
    // windows-1252, like the socket voice; the SSE body is UTF-8.
    await send(tcpPort, Buffer.from('Ünïcode, edit\r\n', 'latin1'));
    await vi.waitFor(() =>
      expect(log).toEqual([
        expect.stringMatching(/^\d+ speech Submit, button$/) as unknown,
        'clear',
        expect.stringMatching(/^\d+ speech Ünïcode, edit$/) as unknown,
      ]),
    );
    expect(errors).toEqual([]);
  });

  it('reconnects to a restarted bridge and gets its speech from seq 1', async () => {
    const port = await freePort();
    const first = await start({ http: { port } });
    const url = `http://127.0.0.1:${port}`;
    const sr = new SpeechCaptureClient({ baseUrl: url, env });
    const log: string[] = [];
    const retries: boolean[] = [];
    const stop = sr.onSpeech((e) => log.push(`${e.seq} ${e.text}`), {
      since: 0,
      onError: (_error, { retrying }) => retries.push(retrying),
    });
    onTestFinished(stop);
    await send(first.tcpPort, 'one\r\ntwo\r\n');
    await vi.waitFor(() => expect(log).toEqual(['1 one', '2 two']));

    await first.stop();
    const second = await start({ http: { port } });
    await send(second.tcpPort, 'new bridge\r\n');
    await vi.waitFor(() => expect(log).toEqual(['1 one', '2 two', '1 new bridge']), {
      timeout: 5000,
    });
    expect(retries.length).toBeGreaterThan(0);
    expect(retries.every(Boolean)).toBe(true);
  });
});

describe('CLI', () => {
  it('tail --json prints live events until interrupted', async () => {
    const { url, say } = await bridge();
    await say('old');
    const controller = new AbortController();
    let stdout = '';
    const done = runCli(['tail', '--json', '--since', '0', '--url', url], {
      config: createClientConfig(env),
      speech: (u) => new SpeechCaptureClient({ baseUrl: u, env }),
      stdout: (t) => (stdout += t),
      stderr: () => undefined,
      version: '0.0.0',
      interrupt: () => controller.signal,
    });
    await vi.waitFor(() => expect(stdout).toContain('old'));
    await say('new');
    await vi.waitFor(() => expect(stdout).toContain('new'));
    controller.abort();
    expect(await done).toBe(EXIT.ok);
    expect(
      stdout
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as unknown),
    ).toEqual([
      { type: 'entry', entry: expect.objectContaining({ seq: 1, text: 'old' }) as unknown },
      { type: 'entry', entry: expect.objectContaining({ seq: 2, text: 'new' }) as unknown },
    ]);
  });

  it('mark → speech → wait --since → text, with exit codes', async () => {
    const { url, say } = await bridge();
    await say('old');
    const mark = await cli(['mark', 'step-1', '--url', url]);
    expect(mark.code).toBe(EXIT.ok);
    const seq = mark.stdout.trim();
    await say('Submit, button');

    const found = await cli([
      'wait',
      'submit',
      '--normalize',
      '--since',
      seq,
      '--json',
      '--url',
      url,
    ]);
    expect(found.code).toBe(EXIT.ok);
    expect(JSON.parse(found.stdout)).toMatchObject({
      matched: true,
      entry: { text: 'Submit, button' },
    });
    expect((await cli(['text', '--since', seq, '--url', url])).stdout).toBe('Submit, button\n');
    expect((await cli(['wait', 'nope', '--timeout', '200', '--url', url])).code).toBe(EXIT.timeout);
    expect((await cli(['status', '--url', url])).stdout).toContain('ready');
  });

  it('session start → speech, text and wait read only the current session', async () => {
    const { url, say } = await bridge();
    await say('old');
    const started = await cli(['session', 'start', 'agent task', '--url', url]);
    expect(started.code).toBe(EXIT.ok);
    const id = started.stdout.trim();
    await say('Submit, button');
    expect((await cli(['text', '--url', url])).stdout).toBe('Submit, button\n');
    expect((await cli(['text', '--all', '--url', url])).stdout).toBe('old\nSubmit, button\n');
    expect((await cli(['wait', 'old', '--timeout', '200', '--url', url])).code).toBe(EXIT.timeout);
    expect((await cli(['wait', 'Submit', '--url', url])).code).toBe(EXIT.ok);
    expect((await cli(['session', 'list', '--url', url])).stdout).toBe(
      `#${id} agent task: current, 1 entry, seq 2-2\n`,
    );
    expect((await cli(['session', 'end', '--url', url])).code).toBe(EXIT.ok);
    expect((await cli(['speech', '--session', id, '--url', url])).stdout).toBe(
      '#2 Submit, button\n',
    );
    expect((await cli(['speech', '--session', '99', '--url', url])).code).toBe(EXIT.bridge);
  });

  it('exits 2 when the bridge is not reachable', async () => {
    const result = await cli(['status', '--url', `http://127.0.0.1:${await freePort()}`]);
    expect(result.code).toBe(EXIT.bridge);
    expect(result.stderr).toContain('ECONNREFUSED');
  });
});
