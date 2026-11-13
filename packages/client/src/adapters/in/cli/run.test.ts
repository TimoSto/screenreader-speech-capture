import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../../test/fakes.js';
import type {
  ExplicitValues,
  ManageClientConfig,
} from '../../../application/ports/in/manage-client-config.js';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { SpeechCaptureService } from '../../../application/services/speech-capture-service.js';
import { ClientConfigError } from '../../../domain/bridge-url.js';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
} from '../../../domain/errors.js';
import { createClientConfig } from '../../../main.js';
import { EXIT, runCli } from './run.js';

/** Records calls and returns canned answers, so only parsing and output are tested here. */
function fakeConfig(overrides: Partial<ManageClientConfig> = {}) {
  const calls: unknown[][] = [];
  const config: ManageClientConfig = {
    location: '/cfg/client.json',
    get: (key: string, explicit?: ExplicitValues) => {
      calls.push(['get', key, explicit]);
      return Promise.resolve({ key: 'url', value: 'http://vm:1', source: 'config' });
    },
    list: (explicit?: ExplicitValues) => {
      calls.push(['list', explicit]);
      return Promise.resolve([{ key: 'url', value: 'http://vm:1', source: 'env' }]);
    },
    set: (key: string, value: string) => {
      calls.push(['set', key, value]);
      return Promise.resolve({ key: 'url', value: 'http://vm:1' });
    },
    unset: (key: string) => {
      calls.push(['unset', key]);
      return Promise.resolve({ key: 'url' });
    },
    ...overrides,
  };
  return { config, calls };
}

/** The real service on an in-memory bridge, plus the URLs the CLI asked for. */
function fakeSpeech() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const urls: (string | undefined)[] = [];
  const speech = (url: string | undefined): SpeechCapture => {
    urls.push(url);
    return new SpeechCaptureService({ api, clock, apiVersion: '1.3' });
  };
  return { api, clock, urls, speech };
}

async function run(
  args: string[],
  config: ManageClientConfig = fakeConfig().config,
  speech = fakeSpeech().speech,
) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config,
    speech,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    version: '1.2.3',
    interrupt: () => new AbortController().signal,
  });
  return { code, stdout, stderr };
}

describe('config', () => {
  it('get passes --url as the explicit value and prints the source', async () => {
    const { config, calls } = fakeConfig();
    expect(await run(['config', 'get', 'url', '--url', 'http://x:1'], config)).toEqual({
      code: EXIT.ok,
      stdout: 'http://vm:1 (config file)\n',
      stderr: '',
    });
    expect(calls).toEqual([['get', 'url', { url: 'http://x:1' }]]);
    expect((await run(['config', 'get', 'url', '--json'], config)).stdout).toBe(
      '{"key":"url","value":"http://vm:1","source":"config"}\n',
    );
  });

  it('set prints where it saved, and warns when the value is shadowed', async () => {
    const { config, calls } = fakeConfig();
    const plain = await run(['config', 'set', 'url', 'http://vm:1/'], config);
    expect(plain.stdout).toBe('Saved url = http://vm:1 to /cfg/client.json\n');
    expect(plain.stderr).toBe('');
    expect(calls).toEqual([['set', 'url', 'http://vm:1/']]);

    const shadowed = fakeConfig({
      set: () => Promise.resolve({ key: 'url', value: 'http://vm:1', shadowedBy: 'env' }),
    });
    const result = await run(['config', 'set', 'url', 'http://vm:1', '--json'], shadowed.config);
    expect(JSON.parse(result.stdout)).toEqual({
      key: 'url',
      value: 'http://vm:1',
      shadowedBy: 'env',
      file: '/cfg/client.json',
    });
    expect(result.stderr).toContain('SR_SPEECH_URL is set and takes precedence');
  });

  it('unset, list and path', async () => {
    expect((await run(['config', 'unset', 'url'])).stdout).toBe(
      'Removed url from /cfg/client.json\n',
    );
    expect((await run(['config', 'list'])).stdout).toBe(
      '# /cfg/client.json\nurl = http://vm:1 (SR_SPEECH_URL)\n',
    );
    expect(JSON.parse((await run(['config', 'list', '--json'])).stdout)).toEqual({
      file: '/cfg/client.json',
      settings: [{ key: 'url', value: 'http://vm:1', source: 'env' }],
    });
    expect((await run(['config', 'path'])).stdout).toBe('/cfg/client.json\n');
  });

  it('exits 3 with the message for a ClientConfigError', async () => {
    const { config } = fakeConfig({
      set: () => Promise.reject(new ClientConfigError('URL "x" is not a valid URL')),
    });
    const { code, stderr } = await run(['config', 'set', 'url', 'x'], config);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('URL "x" is not a valid URL');
  });

  it.each([
    [['config', 'set', 'url']],
    [['config', 'get']],
    [['config', 'path', 'extra']],
    [['config', 'frobnicate']],
    [['config']],
    [['nope']],
    [[]],
    [['--bogus']],
  ])('exits 3 for %j without touching the config', async (args) => {
    const { config, calls } = fakeConfig();
    const { code, stderr } = await run(args, config);
    expect(code).toBe(EXIT.usage);
    expect(stderr).not.toBe('');
    expect(calls).toEqual([]);
  });
});

describe('speech commands', () => {
  const cli = (args: string[], fake = fakeSpeech()) => run(args, fakeConfig().config, fake.speech);

  it('status prints a summary, or the status with --json; --url reaches the client', async () => {
    const fake = fakeSpeech();
    const plain = await cli(['status', '--url', 'http://vm:1'], fake);
    expect(plain.code).toBe(EXIT.ok);
    expect(plain.stdout).toContain('bridge  0.0.0 (API 1.3), ready');
    expect(plain.stdout).toContain('buffer  0 of 10000 entries (empty)');
    expect(fake.urls).toEqual(['http://vm:1']);
    const json = JSON.parse((await cli(['status', '--json'], fake)).stdout) as {
      bridge: { state: string };
    };
    expect(json.bridge.state).toBe('ready');
  });

  it('status --wait-ready waits; a timeout exits 1', async () => {
    const fake = fakeSpeech();
    fake.api.state = 'starting';
    fake.clock.at(1000, () => (fake.api.state = 'ready'));
    expect((await cli(['status', '--wait-ready'], fake)).code).toBe(EXIT.ok);
    fake.api.state = 'stopping';
    const late = await cli(['status', '--wait-ready', '--timeout', '600'], fake);
    expect(late.code).toBe(EXIT.timeout);
    expect(late.stderr).toContain('not ready within 600 ms: state is stopping');
  });

  it('clear, mark, speech and text; --since takes a marker seq', async () => {
    const fake = fakeSpeech();
    fake.api.speak('old');
    expect((await cli(['clear'], fake)).stdout).toBe('Speech buffer cleared.\n');
    fake.api.speak('one');
    const mark = await cli(['mark', 'step 1'], fake);
    expect(mark.stdout).toBe('3\n');
    expect(JSON.parse((await cli(['mark', 'x', '--json'], fake)).stdout)).toMatchObject({
      seq: 4,
      kind: 'marker',
      text: 'x',
    });
    fake.api.speak('two', 'three');

    expect((await cli(['speech'], fake)).stdout).toBe('#2 one\n#5 two\n#6 three\n');
    expect(
      (await cli(['speech', '--include-markers', '--since', '2', '--limit', '2'], fake)).stdout,
    ).toBe('#3 [marker] step 1\n#4 [marker] x\n');
    const json = JSON.parse((await cli(['speech', '--json', '--since', '5'], fake)).stdout) as {
      entries: { text: string }[];
    };
    expect(json.entries.map((e) => e.text)).toEqual(['three']);
    expect((await cli(['text', '--since', '3'], fake)).stdout).toBe('two\nthree\n');
    expect(JSON.parse((await cli(['text', '--json', '--separator', ' '], fake)).stdout)).toEqual({
      text: 'one two three',
    });
  });

  it('wait finds earlier speech (no cursor between calls), with --regex and --normalize', async () => {
    const fake = fakeSpeech();
    fake.api.speak('Submit,  BUTTON');
    expect((await cli(['wait', 'Submit'], fake)).stdout).toBe('#1 Submit,  BUTTON\n');
    expect((await cli(['wait', 'Submit'], fake)).code).toBe(EXIT.ok);
    expect((await cli(['wait', 'submit, button', '--normalize'], fake)).code).toBe(EXIT.ok);
    const json = await cli(['wait', '^sub.*button$', '--regex', '--normalize', '--json'], fake);
    expect(JSON.parse(json.stdout)).toMatchObject({ matched: true, entry: { seq: 1 } });
  });

  it('wait exits 1 on timeout and shows the speech seen', async () => {
    const fake = fakeSpeech();
    fake.api.speak('Name, edit');
    const plain = await cli(['wait', 'Submit', '--timeout', '200'], fake);
    expect(plain).toMatchObject({ code: EXIT.timeout, stdout: '' });
    expect(plain.stderr).toContain(
      'No speech matched "Submit" within 200 ms. Speech seen:\n  #1 Name, edit',
    );
    const json = await cli(['wait', 'Submit', '--timeout', '0', '--json', '--since', '1'], fake);
    expect(JSON.parse(json.stdout)).toEqual({ matched: false, entries: [] });
    expect(json.stderr).toContain('No speech arrived.');
  });

  it('wait-silence succeeds after quiet-for, exits 1 while speech goes on', async () => {
    const fake = fakeSpeech();
    expect(await cli(['wait-silence', '--quiet-for', '100'], fake)).toMatchObject({
      code: EXIT.ok,
      stdout: 'Silent.\n',
    });
    for (let t = 0; t < 5000; t += 50)
      fake.clock.at(fake.clock.now() + t, () => fake.api.speak('x'));
    const busy = await cli(['wait-silence', '--quiet-for', '100', '--timeout', '1000'], fake);
    expect(busy.code).toBe(EXIT.timeout);
  });

  it('session start, list and end', async () => {
    const fake = fakeSpeech();
    expect((await cli(['session', 'list'], fake)).stdout).toBe('No sessions.\n');
    expect((await cli(['session', 'start', 'checkout', '--run', 'nightly'], fake)).stdout).toBe(
      '1\n',
    );
    fake.api.speak('Submit, button');
    expect(JSON.parse((await cli(['session', 'start', 'next', '--json'], fake)).stdout)).toEqual(
      expect.objectContaining({ id: 2, name: 'next', run: null, endedAt: null }),
    );
    expect((await cli(['session', 'list'], fake)).stdout).toBe(
      '#2 next: current, 0 entries\n#1 checkout (run nightly): ended, 1 entry, seq 1-1\n',
    );
    expect((await cli(['status'], fake)).stdout).toContain('session #2 next, 2 in the buffer');
    expect((await cli(['session', 'end'], fake)).stdout).toBe('Session ended.\n');
    expect(JSON.parse((await cli(['session', 'list', '--json'], fake)).stdout)).toMatchObject({
      currentId: null,
      sessions: [{ id: 2 }, { id: 1 }],
    });
    expect((await cli(['status'], fake)).stdout).toContain('session none current, 2 in the buffer');
  });

  it('speech, text and wait read the current session; --session and --all pick others', async () => {
    const fake = fakeSpeech();
    fake.api.speak('before');
    await cli(['session', 'start', 'one'], fake);
    fake.api.speak('Submit, button');
    await cli(['session', 'start', 'two'], fake);
    fake.api.speak('Name, edit');

    expect((await cli(['speech'], fake)).stdout).toBe('#3 Name, edit\n');
    expect((await cli(['text', '--session', '1'], fake)).stdout).toBe('Submit, button\n');
    expect((await cli(['text', '--all'], fake)).stdout).toBe(
      'before\nSubmit, button\nName, edit\n',
    );
    expect((await cli(['wait', 'Submit', '--timeout', '0'], fake)).code).toBe(EXIT.timeout);
    expect((await cli(['wait', 'Submit', '--session', '1'], fake)).stdout).toBe(
      '#2 Submit, button\n',
    );
    const unknown = await cli(['speech', '--session', '9'], fake);
    expect(unknown.code).toBe(EXIT.bridge);

    await cli(['session', 'end'], fake);
    expect((await cli(['text'], fake)).stdout).toBe('before\nSubmit, button\nName, edit\n');
  });

  it('reads the whole buffer on a bridge older than API 1.3', async () => {
    const fake = fakeSpeech();
    fake.api.speak('a');
    const status = fake.api.status.bind(fake.api);
    fake.api.status = async () => {
      const old = await status();
      delete old.session;
      return { ...old, bridge: { ...old.bridge, apiVersion: '1.2' } };
    };
    expect((await cli(['text'], fake)).stdout).toBe('a\n');
    const start = await cli(['session', 'start', 'x'], fake);
    expect(start.code).toBe(EXIT.bridge);
    expect(start.stderr).toContain('Sessions need a bridge with API 1.3');
  });

  it.each([
    [new BridgeUnreachableError('http://vm:1'), 'not reachable'],
    [new BridgeHttpError(500, 'INTERNAL', 'boom'), 'boom (HTTP 500, INTERNAL)'],
    [new IncompatibleBridgeError('2.0', '1.0'), 'speaks API 2.0'],
  ])('exits 2 for %s', async (error, message) => {
    const fake = fakeSpeech();
    fake.api.failures = [error];
    const result = await cli(['speech'], fake);
    expect(result.code).toBe(EXIT.bridge);
    expect(result.stderr).toContain(message);
  });

  it.each([
    [['status', '--since', '1']],
    [['status', '--timeout', '10']],
    [['clear', 'extra']],
    [['speech', '--since', '-1']],
    [['speech', '--limit', '0']],
    [['text', '--since', 'abc']],
    [['wait']],
    [['wait', '']],
    [['wait', '(', '--regex']],
    [['wait', 'x', '--quiet-for', '1']],
    [['wait-silence', '--timeout', '1.5']],
    [['mark']],
    [['config', 'path', '--since', '1']],
    [['session']],
    [['session', 'pause']],
    [['session', 'start']],
    [['session', 'start', ' ']],
    [['session', 'start', 'x', '--run', '']],
    [['session', 'end', '--run', 'x']],
    [['session', 'list', 'extra']],
    [['speech', '--session', '0']],
    [['speech', '--session', '1', '--all']],
    [['text', '--session', 'current']],
    [['wait', 'x', '--all', '--session', '2']],
    [['mark', 'x', '--all']],
  ])('exits 3 for %j without calling the bridge', async (args) => {
    const fake = fakeSpeech();
    const { code, stderr } = await cli(args, fake);
    expect(code).toBe(EXIT.usage);
    expect(stderr).not.toBe('');
    expect(fake.api.calls).toEqual([]);
  });
});

it('--help and --version', async () => {
  expect((await run(['--help'])).stdout).toContain('config set url');
  expect((await run(['--help'])).stdout).toContain('wait <text>');
  expect((await run(['--version'])).stdout).toBe('1.2.3\n');
});

it('works end to end with the real config file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-cli-'));
  try {
    const file = path.join(dir, 'client.json');
    const config = () => createClientConfig({ SR_SPEECH_CLIENT_CONFIG: file });
    expect((await run(['config', 'set', 'url', 'http://my-vm:5151/'], config())).code).toBe(0);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ url: 'http://my-vm:5151' });
    expect((await run(['config', 'get', 'url'], config())).stdout).toBe(
      'http://my-vm:5151 (config file)\n',
    );
    expect((await run(['config', 'unset', 'url'], config())).code).toBe(0);
    expect((await run(['config', 'get', 'url'], config())).stdout).toBe(
      'http://localhost:5151 (default)\n',
    );

    await fs.writeFile(file, '{');
    const broken = await run(['config', 'get', 'url'], config());
    expect(broken.code).toBe(EXIT.usage);
    expect(broken.stderr).toContain(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('tail', () => {
  /** Starts `tail`; `stop()` presses Ctrl+C and resolves with the exit code. */
  function tail(args: string[], speech = fakeSpeech()) {
    const output = { stdout: '', stderr: '' };
    const controller = new AbortController();
    const done = runCli(['tail', ...args], {
      config: fakeConfig().config,
      speech: speech.speech,
      stdout: (t) => (output.stdout += t),
      stderr: (t) => (output.stderr += t),
      version: '1.2.3',
      interrupt: () => controller.signal,
    });
    const stop = async () => {
      controller.abort();
      return done;
    };
    return { ...speech, output, done, stop };
  }

  it('prints speech, markers and clears live until Ctrl+C', async () => {
    const t = tail([]);
    t.api.speak('old');
    await vi.waitFor(() => expect(t.api.openStreams).toBe(1));
    t.api.speak('Submit, button');
    await t.api.mark('step 1');
    await t.api.clear();
    await vi.waitFor(() => expect(t.output.stdout).toContain('cleared'));
    expect(await t.stop()).toBe(EXIT.ok);
    expect(t.output).toEqual({
      stdout: '#2 Submit, button\n#3 [marker] step 1\n--- buffer cleared ---\n',
      stderr: '',
    });
    expect(t.api.openStreams).toBe(0);
  });

  it('--json prints one event per line; --since replays first', async () => {
    const speech = fakeSpeech();
    speech.api.speak('a', 'b');
    const t = tail(['--json', '--since', '1'], speech);
    await vi.waitFor(() => expect(t.api.openStreams).toBe(1));
    await t.api.clear();
    await vi.waitFor(() => expect(t.output.stdout.split('\n')).toHaveLength(3));
    await t.stop();
    const events = t.output.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);
    expect(events).toEqual([
      { type: 'entry', entry: expect.objectContaining({ seq: 2, text: 'b' }) as unknown },
      { type: 'clear' },
    ]);
    expect(t.api.calls).toContain('stream 1');
  });

  it('prints sessions that start and end, also as JSON', async () => {
    const t = tail([]);
    await vi.waitFor(() => expect(t.api.openStreams).toBe(1));
    await t.api.startSession({ name: 'checkout' });
    await t.api.endSession();
    await vi.waitFor(() => expect(t.output.stdout).toContain('ended'));
    await t.stop();
    expect(t.output.stdout).toBe(
      '--- session #1 "checkout" started ---\n--- session #1 "checkout" ended ---\n',
    );

    const j = tail(['--json']);
    await vi.waitFor(() => expect(j.api.openStreams).toBe(1));
    await j.api.startSession({ name: 'x' });
    await vi.waitFor(() => expect(j.output.stdout).not.toBe(''));
    await j.stop();
    expect(JSON.parse(j.output.stdout)).toEqual({
      type: 'session',
      session: expect.objectContaining({ id: 1, name: 'x', endedAt: null }) as unknown,
    });
  });

  it('reports a lost connection on stderr and goes on', async () => {
    const t = tail([]);
    await vi.waitFor(() => expect(t.api.openStreams).toBe(1));
    t.api.dropStreams(new BridgeUnreachableError('http://vm:5151'));
    await vi.waitFor(() =>
      expect(t.api.calls.filter((c) => c.startsWith('stream'))).toHaveLength(2),
    );
    t.api.speak('back');
    await vi.waitFor(() => expect(t.output.stdout).toBe('#1 back\n'));
    expect(await t.stop()).toBe(EXIT.ok);
    expect(t.output.stderr).toMatch(/not reachable.*, reconnecting\n$/);
  });

  it('exits 2 when the bridge is unreachable at the start or incompatible', async () => {
    const unreachable = fakeSpeech();
    unreachable.api.failures = [new BridgeUnreachableError('http://vm:5151')];
    expect(await tail([], unreachable).done).toBe(EXIT.bridge);

    const incompatible = fakeSpeech();
    incompatible.api.apiVersion = '2.0';
    const other = tail([], incompatible);
    expect(await other.done).toBe(EXIT.bridge);
    expect(other.output.stderr).toContain('API 2.0');
  });

  it('rejects arguments and foreign options', async () => {
    expect((await run(['tail', 'x'])).code).toBe(EXIT.usage);
    expect((await run(['tail', '--limit', '3'])).code).toBe(EXIT.usage);
  });
});
