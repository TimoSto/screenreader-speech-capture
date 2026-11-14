#!/usr/bin/env -S npx tsx
/**
 * Behaves like text-to-socket-engine (docs/usage/speech-capture.md#wire-format): connects lazily on
 * the first line, sends the optional header line, then one CRLF-terminated line per "Speak"
 * call. A failed send reconnects and retries once.
 *
 *   pnpm fake-speech "Submit, button" "Edit, Name, blank"
 *   printf 'one\ntwo\n' | pnpm fake-speech --voice dev
 *   pnpm fake-speech            # interactive: every line you type is spoken
 */
import net from 'node:net';
import readline from 'node:readline';
import { parseArgs } from 'node:util';

const HELP = `Usage: fake-speech [options] [text ...]

Sends each text (or each line from stdin, or each typed line) to the bridge like the
SAPI socket voice does.

Options:
  --host <addr>       bridge TCP host (default 127.0.0.1)
  --port <n>          bridge TCP port (default 4449)
  --voice <id>        send "voice=<id>" as the first line of each connection
  --encoding <enc>    latin1 (default, like windows-1252) or utf-8
  --interval <ms>     pause between lines (default 0)
  -h, --help          show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '4449' },
    voice: { type: 'string' },
    encoding: { type: 'string', default: 'latin1' },
    interval: { type: 'string', default: '0' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const port = Number(values.port);
const interval = Number(values.interval);
if (values.encoding !== 'latin1' && values.encoding !== 'utf-8') {
  process.stderr.write(`fake-speech: --encoding must be latin1 or utf-8\n`);
  process.exit(2);
}
const encoding: BufferEncoding = values.encoding;

class SocketVoice {
  private socket: net.Socket | null = null;

  async speak(text: string): Promise<void> {
    try {
      await this.write(text);
    } catch {
      // Like the engine: reconnect and retry once, then give up on this text.
      this.close();
      try {
        await this.write(text);
      } catch (error) {
        this.close();
        process.stderr.write(`fake-speech: dropped "${text}": ${(error as Error).message}\n`);
      }
    }
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }

  private async write(text: string): Promise<void> {
    const socket = this.socket ?? (await this.connect());
    await new Promise<void>((resolve, reject) => {
      socket.write(Buffer.from(`${text}\r\n`, encoding), (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  private async connect(): Promise<net.Socket> {
    const socket = net.connect(port, values.host);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    socket.on('error', () => (this.socket = null));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
    });
    this.socket = socket;
    if (values.voice !== undefined) await this.write(`voice=${values.voice}`);
    return socket;
  }
}

const voice = new SocketVoice();
const pause = () => new Promise((resolve) => setTimeout(resolve, interval));

async function speakAll(lines: AsyncIterable<string> | Iterable<string>) {
  let first = true;
  for await (const line of lines) {
    if (!first && interval > 0) await pause();
    first = false;
    await voice.speak(line);
  }
}

if (positionals.length > 0) {
  await speakAll(positionals);
} else {
  if (process.stdin.isTTY) {
    process.stderr.write(`Speaking to ${values.host}:${port}. Type a line, Ctrl+D to quit.\n`);
  }
  await speakAll(readline.createInterface({ input: process.stdin, terminal: false }));
}
voice.close();
