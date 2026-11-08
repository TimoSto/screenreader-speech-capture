// The client against a real bridge (real TCP + HTTP sockets), fed like the socket voice.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, onTestFinished } from 'vitest';
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
  });
});

describe('CLI', () => {
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

  it('exits 2 when the bridge is not reachable', async () => {
    const result = await cli(['status', '--url', `http://127.0.0.1:${await freePort()}`]);
    expect(result.code).toBe(EXIT.bridge);
    expect(result.stderr).toContain('ECONNREFUSED');
  });
});
