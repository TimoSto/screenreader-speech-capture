import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileSink } from './file-sink.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-log-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('fileSink', () => {
  it('creates the directory, appends lines and accepts the speech channel without colours', () => {
    const file = path.join(dir, 'nested', 'logs', 'bridge.log');
    const sink = fileSink(file);
    expect(sink).toMatchObject({ colour: false, speech: true });
    sink.write('one');
    sink.write('two');
    expect(read(file)).toBe('one\ntwo\n');
  });

  it('appends to an existing file', () => {
    const file = path.join(dir, 'bridge.log');
    fs.writeFileSync(file, 'old\n');
    fileSink(file).write('new');
    expect(read(file)).toBe('old\nnew\n');
  });

  it('rotates at maxBytes and keeps only `keep` old files', () => {
    const file = path.join(dir, 'bridge.log');
    const sink = fileSink(file, { maxBytes: 10, keep: 2 });
    for (const line of ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee']) sink.write(line);
    // 5 bytes per line, 10 bytes per file: [aaaa bbbb] [cccc dddd] [eeee]
    expect(read(file)).toBe('eeee\n');
    expect(read(`${file}.1`)).toBe('cccc\ndddd\n');
    expect(read(`${file}.2`)).toBe('aaaa\nbbbb\n');
    expect(fs.existsSync(`${file}.3`)).toBe(false);

    for (const line of ['ffff', 'gggg']) sink.write(line);
    expect(read(`${file}.2`)).toBe('cccc\ndddd\n');
    expect(fs.existsSync(`${file}.3`)).toBe(false);
  });

  it('reports a write problem once and then stops writing', () => {
    const errors: string[] = [];
    const blocker = path.join(dir, 'not-a-dir');
    fs.writeFileSync(blocker, '');
    const sink = fileSink(path.join(blocker, 'bridge.log'), {
      onError: (error) => errors.push(error.message),
    });
    sink.write('a');
    sink.write('b');
    expect(errors).toHaveLength(1);
  });
});
