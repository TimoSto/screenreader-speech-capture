import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectCliOutput } from '../../../../test/cli-output.js';
import { FakeBridgeApi, FakeClock } from '../../../../test/fakes.js';
import type {
  ExplicitValues,
  ManageClientConfig,
} from '../../../application/ports/in/manage-client-config.js';
import type { NativeInput } from '../../../application/ports/in/native-input.js';
import { NativeInputService } from '../../../application/services/native-input-service.js';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { SpeechCaptureService } from '../../../application/services/speech-capture-service.js';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  ClientConfigError,
  IncompatibleBridgeError,
} from '../../../domain/errors.js';
import { READ_GEOMETRY_SCRIPT, clickPoint } from '../../../domain/native-input.js';
import { createClientConfig } from '../../../main.js';
import { COMMANDS } from './commands/index.js';
import { NAME } from './options.js';
import { CLI_OUTPUT } from './output.js';
import { EXIT, runCli } from './run.js';

/**
 * Records calls and returns canned answers, so only parsing and output are tested here. The
 * `output` every command reads first is `output` and not recorded.
 */
function fakeConfig(overrides: Partial<ManageClientConfig> = {}, output = 'text') {
  const calls: unknown[][] = [];
  const config: ManageClientConfig = {
    location: '/cfg/client.json',
    get: (key: string, explicit?: ExplicitValues) => {
      if (key === 'output' && explicit === undefined) {
        return Promise.resolve({ key: 'output', value: output, source: 'default' });
      }
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
  api.clock = clock;
  const urls: (string | undefined)[] = [];
  const speech = (url: string | undefined): SpeechCapture => {
    urls.push(url);
    return new SpeechCaptureService({ api, clock, apiVersion: '1.3' });
  };
  const input = (url: string | undefined): NativeInput => {
    urls.push(url);
    return new NativeInputService({ api, apiVersion: '1.3' });
  };
  return { api, clock, urls, speech, input };
}

async function run(
  args: string[],
  config: ManageClientConfig = fakeConfig().config,
  fake = fakeSpeech(),
) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config,
    speech: fake.speech,
    input: fake.input,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    version: '1.2.3',
    interrupt: () => new AbortController().signal,
  });
  expectCliOutput(args, stdout);
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

  it('unset and path print the file with --json', async () => {
    expect(JSON.parse((await run(['config', 'unset', 'url', '--json'])).stdout)).toEqual({
      key: 'url',
      file: '/cfg/client.json',
    });
    expect(JSON.parse((await run(['config', 'path', '--json'])).stdout)).toEqual({
      file: '/cfg/client.json',
    });
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
  const cli = (args: string[], fake = fakeSpeech()) => run(args, fakeConfig().config, fake);

  it('status prints a summary, or the status with --json; --url reaches the client', async () => {
    const fake = fakeSpeech();
    const plain = await cli(['status', '--url', 'http://vm:1'], fake);
    expect(plain.code).toBe(EXIT.ok);
    expect(plain.stdout).toContain('bridge  0.0.0 (API 1.4), ready');
    expect(plain.stdout).toContain('buffer  0 of 10000 entries (empty)');
    expect(fake.urls).toEqual(['http://vm:1']);
    const json = JSON.parse((await cli(['status', '--json'], fake)).stdout) as {
      bridge: { state: string };
    };
    expect(json.bridge.state).toBe('ready');
  });

  it('prints the small confirmations with --json', async () => {
    const fake = fakeSpeech();
    await cli(['session', 'start', 'one'], fake);
    const outputs = [];
    for (const args of [
      ['session', 'end'],
      ['clear', '--all'],
      ['wait-silence', '--timeout', '1000'],
    ]) {
      const result = await cli([...args, '--json'], fake);
      expect(result.code).toBe(EXIT.ok);
      outputs.push(JSON.parse(result.stdout) as unknown);
    }
    expect(outputs).toEqual([{ ended: true }, { cleared: true }, { silent: true }]);
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

  it('clear --session and --outside clear one scope and keep the session running', async () => {
    const fake = fakeSpeech();
    fake.api.speak('outside');
    await cli(['session', 'start', 'one'], fake);
    fake.api.speak('in one');
    expect((await cli(['clear', '--session', 'current'], fake)).stdout).toBe(
      'Speech of the current session cleared.\n',
    );
    expect((await cli(['text', '--all'], fake)).stdout).toBe('outside\n');
    expect(JSON.parse((await cli(['clear', '--outside', '--json'], fake)).stdout)).toEqual({
      cleared: true,
    });
    expect(await cli(['text', '--all'], fake)).toMatchObject({
      stdout: '',
      stderr: `${NAME}: no speech.\n`,
    });
    expect(fake.api.calls).toEqual(expect.arrayContaining(['clear current', 'clear none']));
    expect((await cli(['session', 'list'], fake)).stdout).toContain('#1 one: current');
    expect((await cli(['clear', '--session', '1'], fake)).stdout).toBe(
      'Speech of session 1 cleared.\n',
    );
    expect((await run(['clear', '--session', '1', '--outside'], undefined, fake)).code).toBe(
      EXIT.usage,
    );
    expect((await run(['clear', '--session', 'x'], undefined, fake)).code).toBe(EXIT.usage);
  });

  it('clear needs exactly one scope; a bare clear deletes nothing', async () => {
    const fake = fakeSpeech();
    const bare = await cli(['clear', '--json'], fake);
    expect(bare.code).toBe(EXIT.usage);
    expect(JSON.parse(bare.stdout)).toMatchObject({
      error: { type: 'UsageError', message: expect.stringContaining('--all') as unknown },
    });
    for (const args of [
      ['clear', '--all', '--outside'],
      ['clear', '--all', '--session', '1'],
    ]) {
      expect((await cli(args, fake)).stderr).toContain('only one of --all, --session or --outside');
    }
    expect(fake.api.calls.filter((call) => call.startsWith('clear'))).toEqual([]);
  });

  it('--since mark:<label> reads after the newest marker with that label', async () => {
    const fake = fakeSpeech();
    await cli(['mark', 'step-2'], fake);
    fake.api.speak('first try');
    await cli(['mark', 'step-2'], fake);
    fake.api.speak('Checkout, heading level 1');
    expect((await cli(['text', '--since', 'mark:step-2'], fake)).stdout).toBe(
      'Checkout, heading level 1\n',
    );
    expect(fake.api.calls).toContain('latest marker step-2');
    const json = await cli(['speech', '--since', 'mark: step-2 ', '--json'], fake);
    expect(JSON.parse(json.stdout)).toMatchObject({
      entries: [{ text: 'Checkout, heading level 1' }],
    });
    const waited = await cli(['wait', 'Checkout', '--since', 'mark:step-2', '--json'], fake);
    expect(JSON.parse(waited.stdout)).toMatchObject({ matched: true, entry: { seq: 4 } });
  });

  it('--since mark:<label> looks in the scope that is read', async () => {
    const fake = fakeSpeech();
    await cli(['mark', 'step-1'], fake);
    await cli(['session', 'start', 'task'], fake);
    fake.api.speak('in the session');
    const missing = await cli(['text', '--since', 'mark:step-1'], fake);
    expect(missing.code).toBe(EXIT.usage);
    expect(missing.stderr).toContain('No marker "step-1" in session 1');
    expect(missing.stderr).toContain('mark "step-1"');
    const all = await cli(['text', '--since', 'mark:step-1', '--all'], fake);
    expect(all).toMatchObject({ code: EXIT.ok, stdout: 'in the session\n' });
    expect(fake.api.calls).toContain('latest marker step-1 session=1');
    expect(fake.api.calls).toContain('latest marker step-1');
  });

  it('--since mark: needs a label', async () => {
    const fake = fakeSpeech();
    const result = await cli(['text', '--since', 'mark:', '--json'], fake);
    expect(result.code).toBe(EXIT.usage);
    expect(fake.api.calls).toEqual([]);
  });

  it('clear, mark, speech and text; --since takes a marker seq', async () => {
    const fake = fakeSpeech();
    fake.api.speak('old');
    expect((await cli(['clear', '--all'], fake)).stdout).toBe('Speech buffer cleared.\n');
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
      truncated: false,
    });
  });

  it('speech and text print nothing on stdout for no speech, and say so on stderr', async () => {
    const fake = fakeSpeech();
    for (const command of ['speech', 'text']) {
      expect(await cli([command], fake)).toMatchObject({
        code: EXIT.ok,
        stdout: '',
        stderr: `${NAME}: no speech.\n`,
      });
    }
    expect(JSON.parse((await cli(['speech', '--json'], fake)).stdout)).toEqual({
      entries: [],
      truncated: false,
    });
    expect(JSON.parse((await cli(['text', '--json'], fake)).stdout)).toEqual({
      text: '',
      truncated: false,
    });
  });

  it('speech and text show what is left of dropped speech, with a warning', async () => {
    const fake = fakeSpeech();
    fake.api.speak('one', 'two', 'three');
    fake.api.dropOldest(1);
    const speech = await cli(['speech', '--all', '--json'], fake);
    expect(speech.code).toBe(EXIT.ok);
    const json = JSON.parse(speech.stdout) as { entries: { text: string }[]; truncated: boolean };
    expect([json.entries.map((e) => e.text), json.truncated]).toEqual([['two', 'three'], true]);
    expect(speech.stderr).toMatch(/some speech was dropped .*showing what is left/);

    const text = await cli(['text', '--all'], fake);
    expect([text.code, text.stdout]).toEqual([EXIT.ok, 'two\nthree\n']);
    expect(text.stderr).toContain('raise buffer.maxEntries');
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
    expect(JSON.parse(json.stdout)).toEqual({ matched: false, entries: [], truncated: false });
    expect(json.stderr).toContain('No speech arrived.');
  });

  it('a wait timeout hints at --normalize when only case or spacing differ', async () => {
    const fake = fakeSpeech();
    fake.api.speak('Submit,  Button');
    const json = await cli(['wait', 'submit, button', '--timeout', '0', '--json'], fake);
    expect(json.code).toBe(EXIT.timeout);
    expect(json.stderr).toContain('Hint: with --normalize it matches #1 Submit,  Button.');
    expect(JSON.parse(json.stdout)).toMatchObject({ matched: false });

    expect((await cli(['wait', 'Cancel', '--timeout', '0'], fake)).stderr).not.toContain('Hint');
    expect(
      (await cli(['wait', 'cancel', '--normalize', '--timeout', '0'], fake)).stderr,
    ).not.toContain('Hint');
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
    // What kept the screen reader talking.
    expect(busy.stderr).toContain('Speech seen:\n  #');
  });

  it('session start warns when it ended the session of another client', async () => {
    const fake = fakeSpeech();
    fake.api.clientName = 'host pid 1';
    expect((await run(['session', 'start', 'a'], undefined, fake)).stderr).toBe('');
    fake.api.clientName = 'host cli';
    expect(await run(['session', 'start', 'b'], undefined, fake)).toEqual({
      code: EXIT.ok,
      stdout: '2\n',
      stderr: 'Warning: this ended session 1 "a" of another client (host pid 1).\n',
    });
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

  it('session delete removes an ended session and refuses bad ids', async () => {
    const fake = fakeSpeech();
    await cli(['session', 'start', 'one'], fake);
    await cli(['session', 'start', 'two'], fake);
    expect((await cli(['session', 'delete', '1'], fake)).stdout).toBe('Session 1 deleted.\n');
    await cli(['session', 'start', 'three'], fake);
    expect(JSON.parse((await cli(['session', 'delete', '2', '--json'], fake)).stdout)).toEqual({
      deleted: true,
    });
    expect((await cli(['session', 'list'], fake)).stdout).toBe('#3 three: current, 0 entries\n');
    expect((await run(['session', 'delete', 'x'], undefined, fake)).code).toBe(EXIT.usage);
    expect((await run(['session', 'delete', '3'], undefined, fake)).code).not.toBe(EXIT.ok);
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

  it('--session current reads the current session, and is an error when none is', async () => {
    const fake = fakeSpeech();
    fake.api.speak('before');
    await cli(['session', 'start', 'one'], fake);
    fake.api.speak('Submit, button');
    expect((await cli(['text', '--session', 'current'], fake)).stdout).toBe('Submit, button\n');
    expect(fake.api.calls).toContain('list 0 session=current');
    expect((await cli(['wait', 'Submit', '--session', 'current'], fake)).code).toBe(EXIT.ok);

    await cli(['session', 'end'], fake);
    const none = await cli(['speech', '--session', 'current', '--json'], fake);
    expect(none.code).toBe(EXIT.bridge);
    expect(JSON.parse(none.stdout)).toMatchObject({
      error: { type: 'BridgeHttpError', code: 'NOT_FOUND' },
    });
    // Without the option, no current session means the whole buffer.
    expect((await cli(['text'], fake)).stdout).toBe('before\nSubmit, button\n');

    const invalid = await cli(['speech', '--session', 'x'], fake);
    expect(invalid.stderr).toContain('--session must be a session id (>= 1) or current, got "x".');
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
    [['text', '--session', 'now']],
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
  expect((await run(['--help'])).stdout).toContain('config set <key> <value>');
  expect((await run(['--help'])).stdout).toContain('wait <text>');
  expect((await run(['--version'])).stdout).toBe('1.2.3\n');
});

it('<command> --help shows only that command, even with arguments that would not parse', async () => {
  const press = await run(['press', '--help']);
  expect(press.code).toBe(EXIT.ok);
  expect(press.stdout).toMatch(/^Usage:\n {2}press <keys\.\.\.>/);
  expect(press.stdout).not.toContain('Commands:');
  expect((await run(['session', 'start', '-h'])).stdout).toContain('session list');
  expect((await run(['wait', '--help', '--limit', 'x'])).code).toBe(EXIT.ok);
  expect(await run(['nope', '--help'])).toMatchObject({ code: EXIT.usage, stdout: '' });
});

it('--help --json describes every command and its --json output', async () => {
  const all = await run(['--help', '--json']);
  expect(all.code).toBe(EXIT.ok);
  const help = JSON.parse(all.stdout) as {
    version: string;
    commands: { name: string; outputs: Record<string, Record<string, unknown>> }[];
  };
  expect(help.version).toBe('1.2.3');
  expect(help.commands.map((c) => c.name).sort()).toEqual(Object.keys(COMMANDS).sort());
  const outputs = help.commands.flatMap((c) => Object.keys(c.outputs));
  expect(outputs.sort()).toEqual(Object.keys(CLI_OUTPUT).sort());
  expect(help.commands.find((c) => c.name === 'speech')?.outputs.speech).toMatchObject({
    type: 'object',
    required: expect.arrayContaining(['entries', 'truncated']) as unknown,
  });

  const wait = JSON.parse((await run(['wait', '--help', '--json'])).stdout) as typeof help;
  expect(wait.commands.map((c) => c.name)).toEqual(['wait']);
  expect(Object.keys(wait.commands[0]!.outputs)).toEqual(['wait']);
});

describe('the output setting', () => {
  const json = fakeConfig({}, 'json').config;

  it('json prints the --json shapes without --json, errors included', async () => {
    const fake = fakeSpeech();
    fake.api.speak('hello');
    const text = await run(['text', '--all'], json, fake);
    expectCliOutput(['text'], text.stdout, true);
    expect(JSON.parse(text.stdout)).toEqual({ text: 'hello', truncated: false });
    const bad = await run(['speech', '--limit', 'x'], json, fake);
    expect(bad.code).toBe(EXIT.usage);
    expect(JSON.parse(bad.stdout)).toMatchObject({ error: { type: 'UsageError' } });
  });

  it('leaves --help as text', async () => {
    expect((await run(['--help'], json)).stdout).toMatch(/^Usage:/);
  });

  it('an invalid value exits 3, except for config, which can repair it', async () => {
    const broken = fakeConfig({
      get: () =>
        Promise.reject(new ClientConfigError('SR_SPEECH_OUTPUT "xml" must be text or json')),
    }).config;
    expect(await run(['text'], broken)).toMatchObject({ code: EXIT.usage });
    // --json doesn't need the setting.
    expect((await run(['status', '--json'], broken)).code).toBe(EXIT.ok);
    expect((await run(['config', 'path'], broken)).code).toBe(EXIT.ok);
  });

  it('config get output --json names --json as the explicit source', async () => {
    const { config, calls } = fakeConfig();
    await run(['config', 'get', 'output', '--json'], config);
    expect(calls).toEqual([['get', 'output', { url: undefined, output: 'json' }]]);
  });
});

it('config never creates a bridge client', async () => {
  const fake = fakeSpeech();
  fake.speech = (): SpeechCapture => {
    throw new Error('config must not create a bridge client');
  };
  fake.input = (): NativeInput => {
    throw new Error('config must not create a bridge client');
  };
  expect(await run(['config', 'path'], fakeConfig().config, fake)).toMatchObject({
    code: EXIT.ok,
    stdout: '/cfg/client.json\n',
  });
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

describe('native input commands', () => {
  const cli = (args: string[], fake = fakeSpeech()) => run(args, fakeConfig().config, fake);

  it('click clicks at the given point', async () => {
    const fake = fakeSpeech();
    expect(await cli(['click', '--x', '640', '--y', '12'], fake)).toEqual({
      code: EXIT.ok,
      stdout: 'Clicked at 640,12\n',
      stderr: '',
    });
    await cli(['click', '--x=-5', '--y', '3', '--button', 'right', '--json'], fake);
    expect(fake.api.calls.filter((call) => call.startsWith('click'))).toEqual([
      'click left 640,12',
      'click right -5,3',
    ]);
  });

  it('click needs both coordinates and a valid button', async () => {
    expect((await cli(['click', '--x', '1'])).code).toBe(EXIT.usage);
    expect((await cli(['click', '--x', 'a', '--y', '1'])).stderr).toContain(
      '--x must be an integer',
    );
    expect((await cli(['click', '--x', '1', '--y', '1', '--button', 'back'])).code).toBe(
      EXIT.usage,
    );
    expect((await cli(['click', '--x', '1', '--y', '1', '--delay', '5'])).code).toBe(EXIT.usage);
  });

  it('press sends one chord, or several arguments as a sequence', async () => {
    const fake = fakeSpeech();
    expect((await cli(['press', 'Insert+T', '--json'], fake)).stdout).toBe('{"pressed":true}\n');
    await cli(['press', 'h', 'h', 'Insert+Down', '--delay', '20'], fake);
    expect(fake.api.calls.filter((call) => call.startsWith('keys'))).toEqual([
      'keys Insert+T',
      'keys h h Insert+Down delay=20',
    ]);
  });

  it('press rejects an unknown key name before sending anything', async () => {
    const fake = fakeSpeech();
    const result = await cli(['press', 'h', 'Insert+Foo', '--json'], fake);
    expect(result.code).toBe(EXIT.usage);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        type: 'UsageError',
        message: 'Invalid key: unknown key "Foo" in "Insert+Foo" (key names: --help).',
      },
    });
    expect(fake.api.calls.filter((call) => call.startsWith('keys'))).toEqual([]);
    expect((await cli(['press', 'ctrl+Home', 'PgDn'], fake)).code).toBe(EXIT.ok);
  });

  it('press needs keys, and a bridge error exits 2', async () => {
    expect((await cli(['press'])).code).toBe(EXIT.usage);
    const fake = fakeSpeech();
    await fake.api.status();
    fake.api.failures.push(
      new BridgeHttpError(409, 'INPUT_DISABLED', 'Native input is not available'),
    );
    const result = await cli(['press', 'a'], fake);
    expect(result.code).toBe(EXIT.bridge);
  });

  /** A fake bridge whose screen reader says `texts` on every key press and click. */
  function speaking(...texts: string[]) {
    const fake = fakeSpeech();
    const { api } = fake;
    const pressKeys = api.pressKeys.bind(api);
    const click = api.click.bind(api);
    api.pressKeys = (request) => pressKeys(request).then(() => api.speak(...texts));
    api.click = (request) => click(request).then(() => api.speak(...texts));
    return fake;
  }

  it('press --capture prints the speech the press caused, not older speech', async () => {
    const fake = speaking('Checkout, heading level 1');
    fake.api.speak('Submit, button');
    const result = await cli(['press', 'h', '--capture', '--json'], fake);
    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.stdout)).toMatchObject({
      pressed: true,
      entries: [{ text: 'Checkout, heading level 1' }],
      truncated: false,
    });
    expect(fake.api.calls).toContain('keys h');

    const text = await cli(['press', 'h', '--capture', '--quiet-for', '200'], fake);
    expect(text).toMatchObject({ code: EXIT.ok, stdout: 'Checkout, heading level 1\n' });
  });

  it('press --capture lets the bridge capture: one request after the version check', async () => {
    const fake = speaking('Checkout, heading level 1');
    const result = await cli(
      ['press', 'h', '--capture', '--settle', '300', '--quiet-for', '200', '--json'],
      fake,
    );
    expect(result.code).toBe(EXIT.ok);
    expect(fake.api.calls).toEqual(['status', 'keys h']);
    expect(fake.api.captures).toEqual([
      { quietForMs: 200, firstWithinMs: undefined, timeoutMs: undefined, settleMs: 300 },
    ]);
  });

  it('click --capture prints the speech the click caused', async () => {
    const fake = speaking('Checkout - Browser', 'Main landmark');
    const result = await cli(['click', '--x', '1', '--y', '2', '--capture', '--json'], fake);
    expect(JSON.parse(result.stdout)).toMatchObject({
      clicked: true,
      entries: [{ text: 'Checkout - Browser' }, { text: 'Main landmark' }],
      truncated: false,
    });
  });

  const GEOMETRY = {
    screenX: 100,
    screenY: 50,
    outerWidth: 1200,
    outerHeight: 900,
    innerWidth: 1184,
    innerHeight: 780,
    devicePixelRatio: 1.5,
  };

  it("focus without options lets the bridge bring MCP's browser to the front", async () => {
    const fake = fakeSpeech();
    fake.api.windows = [{ target: 'mcp', pid: 9, titleOf: () => 'Shop - Chromium' }];
    const json = await cli(['focus', '--json'], fake);
    expect(JSON.parse(json.stdout)).toEqual({
      focused: true,
      window: { title: 'Shop - Chromium', pid: 9 },
    });
    expect(fake.api.calls).toContain('focus mcp');
    expect((await cli(['focus'], fake)).stdout).toBe('Focused "Shop - Chromium"\n');
    expect(fake.api.calls.filter((call) => call.startsWith('click'))).toEqual([]);
  });

  it('focus without options exits 2 when MCP has no browser window', async () => {
    const result = await cli(['focus'], fakeSpeech());
    expect(result.code).toBe(EXIT.bridge);
    expect(result.stderr).toContain('NOT_FOUND');
  });

  it('focus --script prints the function for MCP browser_evaluate, without the bridge', async () => {
    const fake = fakeSpeech();
    const result = await cli(['focus', '--script', '--json'], fake);
    const { script } = JSON.parse(result.stdout) as { script: string };
    // The same script setFocus evaluates, so --geometry gets what parseWindowGeometry takes.
    expect(script).toBe(`() => ${READ_GEOMETRY_SCRIPT}`);
    expect(fake.api.calls).toEqual([]);
  });

  it('focus --geometry clicks the middle of the title bar, like setFocus', async () => {
    const fake = fakeSpeech();
    const point = clickPoint(GEOMETRY);
    const result = await cli(['focus', '--geometry', JSON.stringify(GEOMETRY), '--json'], fake);
    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.stdout)).toEqual({ focused: true, point });
    expect(fake.api.calls).toContain(`click left ${point.x},${point.y}`);
  });

  it('focus --geometry --capture prints what the screen reader said about the window', async () => {
    const fake = speaking('Checkout - Browser');
    const result = await cli(
      ['focus', '--geometry', JSON.stringify(GEOMETRY), '--capture', '--json'],
      fake,
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      focused: true,
      entries: [{ text: 'Checkout - Browser' }],
      truncated: false,
    });
  });

  it.each([
    [['focus', '--capture']],
    [['focus', '--quiet-for', '100']],
    [['focus', '--script', '--geometry', '{}']],
    [['focus', '--script', '--capture']],
    [['focus', '--geometry', 'not json']],
    [['focus', '--geometry', '{"screenX":0}']],
  ])('focus %j is a usage error and clicks nothing', async (args) => {
    const fake = fakeSpeech();
    const result = await cli([...args, '--json'], fake);
    expect(result.code).toBe(EXIT.usage);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { type: 'UsageError' } });
    expect(fake.api.calls).toEqual([]);
  });

  it('press --capture exits 1 with the speech so far when the speech does not pause', async () => {
    const fake = fakeSpeech();
    for (let t = 0; t < 5000; t += 50)
      fake.clock.at(fake.clock.now() + t, () => fake.api.speak(`tick ${t}`));
    const result = await cli(
      ['press', 'h', '--capture', '--quiet-for', '100', '--timeout', '1000', '--json'],
      fake,
    );
    expect(result.code).toBe(EXIT.timeout);
    const output = JSON.parse(result.stdout) as { entries: { text: string }[] };
    expect(output).toMatchObject({ pressed: true, silent: false, truncated: false });
    expect(output.entries.length).toBeGreaterThan(10);
    expect(result.stderr).toContain('Speech did not pause for 100 ms within 1000 ms');
    expect(fake.api.calls).toContain('keys h');

    const text = await cli(
      ['press', 'h', '--capture', '--quiet-for', '100', '--timeout', '1000'],
      fake,
    );
    expect(text.code).toBe(EXIT.timeout);
    expect(text.stdout).toMatch(/^tick \d+\n/);
  });

  it('press --capture waits --first-within for speech that starts late', async () => {
    const fake = fakeSpeech();
    const { api, clock } = fake;
    const pressKeys = api.pressKeys.bind(api);
    api.pressKeys = (request) =>
      pressKeys(request).then(() => clock.at(clock.now() + 1500, () => api.speak('Dialog')));
    const late = await cli(['press', 'Enter', '--capture', '--json'], fake);
    expect(JSON.parse(late.stdout)).toMatchObject({ entries: [{ text: 'Dialog' }], silent: true });

    const early = await cli(
      ['press', 'Enter', '--capture', '--first-within', '500', '--json'],
      fake,
    );
    expect(JSON.parse(early.stdout)).toMatchObject({ entries: [], silent: true });
  });

  it('press --capture says so when nothing was spoken', async () => {
    const fake = fakeSpeech();
    const text = await cli(['press', 'h', '--capture', '--first-within', '100'], fake);
    expect(text).toMatchObject({ code: EXIT.ok, stdout: '' });
    expect(text.stderr).toContain('no speech after the action');
    const json = await cli(['press', 'h', '--capture', '--first-within', '100', '--json'], fake);
    expect(JSON.parse(json.stdout)).toEqual({
      pressed: true,
      entries: [],
      truncated: false,
      silent: true,
    });
  });

  it('--quiet-for, --timeout and --settle only go with --capture', async () => {
    const fake = fakeSpeech();
    for (const args of [
      ['press', 'h', '--quiet-for', '100'],
      ['press', 'h', '--settle', '100'],
      ['click', '--x', '1', '--y', '1', '--timeout', '100'],
    ]) {
      const result = await cli(args, fake);
      expect(result.code).toBe(EXIT.usage);
      expect(result.stderr).toContain('only go with --capture');
    }
    expect(fake.api.calls.filter((c) => c.startsWith('keys') || c.startsWith('click'))).toEqual([]);
  });
});

describe('tail', () => {
  /** Starts `tail`; `stop()` presses Ctrl+C and resolves with the exit code. */
  function tail(args: string[], speech = fakeSpeech()) {
    const output = { stdout: '', stderr: '' };
    const controller = new AbortController();
    const done = runCli(['tail', ...args], {
      config: fakeConfig().config,
      speech: speech.speech,
      input: speech.input,
      stdout: (t) => (output.stdout += t),
      stderr: (t) => (output.stderr += t),
      version: '1.2.3',
      interrupt: () => controller.signal,
    });
    const stop = async () => {
      controller.abort();
      const code = await done;
      expectCliOutput(['tail', ...args], output.stdout);
      return code;
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

  it('ends with the error as its last --json line when the feed stops for good', async () => {
    const t = tail(['--json']);
    await vi.waitFor(() => expect(t.api.openStreams).toBe(1));
    t.api.speak('one');
    await vi.waitFor(() => expect(t.output.stdout).not.toBe(''));
    t.api.dropStreams(new BridgeHttpError(404, 'NOT_FOUND', 'Gone'));
    expect(await t.done).toBe(EXIT.bridge);
    expectCliOutput(['tail', '--json'], t.output.stdout);
    const lines = t.output.stdout.trim().split('\n');
    expect(JSON.parse(lines.at(-1)!)).toEqual({
      error: {
        type: 'BridgeHttpError',
        message: 'Gone (HTTP 404, NOT_FOUND)',
        status: 404,
        code: 'NOT_FOUND',
      },
    });
    expect(t.output.stderr).toContain('Gone (HTTP 404, NOT_FOUND)');
  });
});

describe('errors', () => {
  const cli = (args: string[], fake = fakeSpeech()) => run(args, fakeConfig().config, fake);
  const errorOf = (stdout: string) => (JSON.parse(stdout) as { error: unknown }).error;

  it('--json prints the error object on stdout, the message stays on stderr', async () => {
    const fake = fakeSpeech();
    fake.api.failures = [new BridgeUnreachableError('http://vm:5151')];
    const result = await cli(['status', '--json'], fake);
    expect(result.code).toBe(EXIT.bridge);
    expect(errorOf(result.stdout)).toEqual({
      type: 'BridgeUnreachableError',
      message: 'The bridge at http://vm:5151 is not reachable',
    });
    expect(result.stderr).toContain('not reachable');
  });

  it('without --json, stdout stays empty', async () => {
    const fake = fakeSpeech();
    fake.api.failures = [new BridgeUnreachableError('http://vm:5151')];
    expect(await cli(['status'], fake)).toMatchObject({ code: EXIT.bridge, stdout: '' });
  });

  it("keeps a bridge error's status, code and details", async () => {
    const fake = fakeSpeech();
    await fake.api.status();
    fake.api.failures.push(
      new BridgeHttpError(400, 'INVALID_REQUEST', 'keys: at most 100 chords', { field: 'keys' }),
    );
    const result = await cli(['press', 'h', '--json'], fake);
    expect(result.code).toBe(EXIT.bridge);
    expect(errorOf(result.stdout)).toEqual({
      type: 'BridgeHttpError',
      message: 'keys: at most 100 chords (HTTP 400, INVALID_REQUEST)',
      status: 400,
      code: 'INVALID_REQUEST',
      details: { field: 'keys' },
    });
  });

  it('tells an incompatible bridge apart from an unreachable one', async () => {
    const fake = fakeSpeech();
    fake.api.apiVersion = '2.0';
    const result = await cli(['text', '--json'], fake);
    expect(result.code).toBe(EXIT.bridge);
    expect(errorOf(result.stdout)).toMatchObject({ type: 'IncompatibleBridgeError' });
  });

  it.each([
    [['wait', '--json']],
    [['--bogus', '--json']],
    [['speech', '--limit', 'x', '--json']],
    [['--json']],
  ])('reports invalid usage %j as UsageError, exit 3', async (args) => {
    const result = await cli(args);
    expect(result.code).toBe(EXIT.usage);
    expect(errorOf(result.stdout)).toMatchObject({ type: 'UsageError' });
    expect(result.stderr).toContain('Run with --help');
  });

  it('reports an invalid config as ClientConfigError, exit 3', async () => {
    const { config } = fakeConfig({
      set: () => Promise.reject(new ClientConfigError('URL "x" is not a valid URL')),
    });
    const result = await run(['config', 'set', 'url', 'x', '--json'], config);
    expect(result.code).toBe(EXIT.usage);
    expect(errorOf(result.stdout)).toEqual({
      type: 'ClientConfigError',
      message: 'URL "x" is not a valid URL',
    });
  });

  it('timeouts of status --wait-ready and wait-silence print an error object, exit 1', async () => {
    const fake = fakeSpeech();
    fake.api.state = 'starting';
    const ready = await cli(['status', '--wait-ready', '--timeout', '300', '--json'], fake);
    expect(ready.code).toBe(EXIT.timeout);
    expect(errorOf(ready.stdout)).toMatchObject({ type: 'BridgeNotReadyError' });

    fake.api.state = 'ready';
    for (let t = 0; t < 5000; t += 50)
      fake.clock.at(fake.clock.now() + t, () => fake.api.speak('x'));
    const busy = await cli(
      ['wait-silence', '--quiet-for', '100', '--timeout', '1000', '--json'],
      fake,
    );
    expect(busy.code).toBe(EXIT.timeout);
    expect(errorOf(busy.stdout)).toMatchObject({ type: 'SpeechTimeoutError' });
    expect(busy.stderr).toContain('1000 ms');
  });

  it('an unexpected error is a bug: exit 4 with the stack, not 1', async () => {
    const fake = fakeSpeech();
    fake.api.failures = [new TypeError('boom')];
    const result = await cli(['status', '--json'], fake);
    expect(result.code).toBe(EXIT.internal);
    expect(errorOf(result.stdout)).toEqual({ type: 'InternalError', message: 'boom' });
    expect(result.stderr).toContain('internal error, please report it: TypeError: boom');
    expect(result.stderr).toContain('run.test.ts');
  });
});
