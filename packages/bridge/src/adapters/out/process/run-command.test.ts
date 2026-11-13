import { describe, expect, it } from 'vitest';
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
});
