import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const bridgeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(bridgeDir, 'src/adapters/in/cli/cli.ts');

let dir: string | undefined;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
  dir = undefined;
});

// Windows can't send SIGTERM to another process: `kill` ends it at once.
describe.skipIf(process.platform === 'win32')('CLI lifecycle (real process)', () => {
  it('stops gracefully on SIGTERM and exits with 0', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-speech-cli-'));
    const logFile = path.join(dir, 'bridge.log');
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        cli,
        ...['--tcp-port', '0', '--http-port', '0', '--host', '127.0.0.1'],
        '--no-playwright',
        ...['--config', path.join(dir, 'config.json'), '--bridge-log', logFile],
      ],
      { cwd: bridgeDir, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stdout += chunk));
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));

    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (/INFO {2}ready$/m.test(stdout)) resolve();
      });
      void exited.then(() => reject(new Error(`exited before ready:\n${stdout}`)));
    });
    child.kill('SIGTERM');

    expect(await exited).toBe(0);
    const log = await fs.readFile(logFile, 'utf8');
    expect(log).toMatch(/\[bridge\] +\S+ INFO {2}stopping \(SIGTERM\)$/m);
    expect(log).toMatch(/\[bridge\] +\S+ INFO {2}stopped$/m);
    expect(stdout).toMatch(/INFO {2}stopped$/m);
  }, 20_000);
});
