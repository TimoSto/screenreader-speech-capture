// Stands in for a child service (Playwright server) in tests. Usage:
//   node fake-service.mjs --port <n> [--exit <code>] [--pid <file>] [--grandchild <pid file>]
// --exit: exit at once with that code (a crash before the port opens).
// --pid: write its own PID to the file.
// --grandchild: start a child process that runs until killed and write its PID to the file.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    exit: { type: 'string' },
    grandchild: { type: 'string' },
    pid: { type: 'string' },
  },
});

console.error('fake service warming up');
if (values.exit !== undefined) process.exit(Number(values.exit));

if (values.pid !== undefined) writeFileSync(values.pid, String(process.pid));
if (values.grandchild !== undefined) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(values.grandchild, String(child.pid));
}

const server = net.createServer((socket) => socket.end());
server.listen(Number(values.port), '127.0.0.1', () => {
  console.log(`Listening on ${server.address().port}`);
});
