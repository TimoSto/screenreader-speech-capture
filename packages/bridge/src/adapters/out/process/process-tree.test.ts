import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { eventually } from '../../../../test/helpers.js';
import { MemoryLogger } from '../../../../test/fakes.js';
import {
  type Exec,
  findDescendants,
  killAllTreesNow,
  killTree,
  parseProcessTable,
  pipeLines,
  trackTree,
  treeSpawnOptions,
} from './process-tree.js';

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

describe('findDescendants', () => {
  const table = [
    { pid: 10, parentPid: 1, createdMs: 1000 },
    { pid: 11, parentPid: 10, createdMs: 1100 },
    { pid: 12, parentPid: 11, createdMs: 1200 },
    { pid: 13, parentPid: 99, createdMs: 1300 },
    // Reused pid: its recorded parent is 10, but it was created before 10 started.
    { pid: 14, parentPid: 10, createdMs: 500 },
  ];

  it('finds children at any depth, also of a parent that no longer exists', () => {
    expect(findDescendants(table, 10, 1000).sort()).toEqual([11, 12]);
    // 10 itself is gone from the table (it died); its children still name it.
    expect(findDescendants(table.slice(1), 10, 1000).sort()).toEqual([11, 12]);
  });

  it('ignores rows created before the root started (pid reuse)', () => {
    expect(findDescendants(table, 10, 1000)).not.toContain(14);
  });
});

describe('parseProcessTable', () => {
  it('reads `pid parentPid createdMs` lines and skips anything else', () => {
    expect(parseProcessTable('4 0 1\r\n10 4 2000\nnoise\n\n')).toEqual([
      { pid: 4, parentPid: 0, createdMs: 1 },
      { pid: 10, parentPid: 4, createdMs: 2000 },
    ]);
  });
});

describe('killTree on Windows', () => {
  const exited = () => {
    const child = spawn(process.execPath, ['-e', ''], treeSpawnOptions);
    return once(child, 'exit').then(() => child);
  };

  it('still kills what a child that has already exited left behind', async () => {
    const child = await exited();
    trackTree(child);
    const killed: string[] = [];
    const exec: Exec = (file, args) => {
      if (file === 'powershell') {
        const created = Date.now() + 1000;
        return Promise.resolve({
          ok: true,
          stdout: `${child.pid} 1 ${created}\n7001 ${child.pid} ${created}\n7002 7001 ${created}\n`,
        });
      }
      killed.push(args.at(-1)!);
      return Promise.resolve({ ok: true, stdout: '' });
    };
    await killTree(child, { platform: 'win32', exec });
    // The child is gone, so no taskkill for it; its orphans are killed.
    expect(killed.sort()).toEqual(['7001', '7002']);
  });

  it('does not hang when taskkill and the process query fail', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], treeSpawnOptions);
    const exec: Exec = () => Promise.resolve({ ok: false, stdout: '' });
    const started = Date.now();
    await killTree(child, { platform: 'win32', exec, exitTimeoutMs: 100 });
    expect(Date.now() - started).toBeLessThan(2000);
    child.kill('SIGKILL');
    await once(child, 'exit');
  });
});

describe.skipIf(process.platform === 'win32')('killAllTreesNow', () => {
  it('ends every tracked tree at once', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], treeSpawnOptions);
    trackTree(child);
    killAllTreesNow();
    await once(child, 'exit');
    expect(child.signalCode).toBe('SIGKILL');
  });
});
