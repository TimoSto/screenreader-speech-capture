// Stands in for a child service (Playwright server) in tests. Usage:
//   node fake-service.mjs --port <n> [--http] [--exit <code>] [--pid <file>] [--grandchild <pid file>]
// --http: speak HTTP (the proxy tests). A POST is answered with `{ method, url, headers, body }`
//   as JSON, a GET with an event stream that stays open after its first event, and a WebSocket
//   upgrade with `101` (its `x-seen-*` headers show what arrived), then echoes every byte.
// --exit: exit at once with that code (a crash before the port opens).
// --pid: write its own PID to the file.
// --grandchild: start a child process that runs until killed and write its PID to the file.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    exit: { type: 'string' },
    grandchild: { type: 'string' },
    pid: { type: 'string' },
    http: { type: 'boolean' },
  },
});

console.error('fake service warming up');
if (values.exit !== undefined) process.exit(Number(values.exit));

if (values.pid !== undefined) writeFileSync(values.pid, String(process.pid));
if (values.grandchild !== undefined) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(values.grandchild, String(child.pid));
}

const server = values.http ? httpServer() : net.createServer((socket) => socket.end());
server.listen(Number(values.port), '127.0.0.1', () => {
  console.log(`Listening on ${server.address().port}`);
});

function httpServer() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const seen = { method: req.method, url: req.url, headers: req.headers, body };
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify(seen)}\n\n`);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(seen));
    });
  });
  server.on('upgrade', (req, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `x-seen-url: ${req.url}\r\nx-seen-host: ${req.headers.host}\r\n` +
        `x-seen-origin: ${req.headers.origin ?? '-'}\r\n\r\n`,
    );
    socket.pipe(socket);
  });
  return server;
}
