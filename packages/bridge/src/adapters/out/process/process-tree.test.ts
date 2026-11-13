import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { eventually } from '../../../../test/helpers.js';
import { MemoryLogger } from '../../../../test/fakes.js';
import { killTree, pipeLines, treeSpawnOptions } from './process-tree.js';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('pipeLines', () => {
  it('logs stdout lines as info and stderr lines as warn, split on any line break', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const output = new MemoryLogger();
    pipeLines({ stdout, stderr } as unknown as ChildProcess, output);
    stdout.end('one\r\ntwo\n');
    stderr.end('oops\n');
    await eventually(
      () => output.lines.length,
      (n) => n === 3,
    );
    expect(output.lines).toEqual(expect.arrayContaining(['info one', 'info two', 'warn oops']));
  });
});

describe('killTree', () => {
  it('resolves at once for a child without pid or one that has exited', async () => {
    await killTree({ pid: undefined } as ChildProcess);
    const child = spawn(process.execPath, ['-e', ''], treeSpawnOptions);
    await once(child, 'exit');
    await killTree(child);
  });

  it.skipIf(process.platform === 'win32')(
    'kills the child and the processes it started',
    async () => {
      // The child starts a grandchild that ignores its parent's death, and prints its pid.
      const script = `
        const { spawn } = require('node:child_process');
        const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        console.log(g.pid);
        setInterval(() => {}, 1000);
      `;
      const child = spawn(process.execPath, ['-e', script], {
        ...treeSpawnOptions,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const [chunk] = (await once(child.stdout, 'data')) as [Buffer];
      const grandchild = Number(chunk.toString().trim());
      expect(alive(grandchild)).toBe(true);

      await killTree(child);

      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(
        await eventually(
          () => alive(grandchild),
          (a) => !a,
        ),
      ).toBe(false);
    },
  );
});
