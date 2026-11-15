import { describe, expect, it } from 'vitest';
import { eventually } from '../../../../test/helpers.js';
import { MemoryLogger } from '../../../../test/fakes.js';
import { runCommand } from './run-command.js';

const node = process.execPath;

describe('runCommand', () => {
  it('resolves when the program exits with 0, with stdout as info and stderr as warn', async () => {
    const output = new MemoryLogger();
    await runCommand(output)(node, ['-e', 'console.log("out"); console.error("err")']);
    expect(output.lines).toEqual(expect.arrayContaining(['info out', 'warn err']));
  });

  it('rejects naming the command and the exit code', async () => {
    await expect(runCommand(new MemoryLogger())(node, ['-e', 'process.exit(3)'])).rejects.toThrow(
      /-e process\.exit\(3\) exited with code 3$/,
    );
  });

  it('runs in cwd', async () => {
    const output = new MemoryLogger();
    const cwd = (await import('node:os')).tmpdir();
    await runCommand(output)(node, ['-e', 'console.log(process.cwd())'], { cwd });
    const { realpathSync } = await import('node:fs');
    expect(output.lines.map((l) => l.replace(/^info /, '')).map((p) => realpathSync(p))).toEqual([
      realpathSync(cwd),
    ]);
  });

  it('stops the program when the signal aborts', async () => {
    const controller = new AbortController();
    const running = runCommand(new MemoryLogger())(node, ['-e', 'setTimeout(() => {}, 60000)'], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(running).rejects.toThrow();
  });

  it('runs a command line through the shell', async () => {
    const output = new MemoryLogger();
    await runCommand(output)('echo', ['via', 'shell'], { shell: true });
    expect(output.lines).toEqual(['info via shell']);
  });

  it('rejects when the program runs longer than the deadline, and kills it', async () => {
    const started = Date.now();
    await expect(
      runCommand(new MemoryLogger())(node, ['-e', 'setTimeout(() => {}, 60000)'], {
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/did not finish within 0 s|did not finish within/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it.skipIf(process.platform === 'win32')(
    'ends the whole tree on abort, not just the program',
    async () => {
      const output = new MemoryLogger();
      const controller = new AbortController();
      const script = `
        const { spawn } = require('node:child_process');
        const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        console.log(g.pid);
        setInterval(() => {}, 1000);
      `;
      const running = runCommand(output)(node, ['-e', script], { signal: controller.signal });
      const grandchild = await eventually(
        () => Number(output.lines[0]?.replace('info ', '')),
        (pid) => pid > 0,
      );
      controller.abort();
      await expect(running).rejects.toThrow(/was stopped/);
      expect(
        await eventually(
          () => alive(grandchild),
          (a) => !a,
        ),
      ).toBe(false);
    },
  );

  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCommand(new MemoryLogger())(node, ['-e', ''], { signal: controller.signal }),
    ).rejects.toThrow();
  });
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
