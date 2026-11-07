import net from 'node:net';
import type { RecordSpeech } from '../../../application/ports/in/record-speech.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { Config } from '../../../domain/config.js';
import { TextToSocketParser } from './text-to-socket-parser.js';

export type TcpSettings = Config['tcp'];

/** Thrown by `start()` when the port can't be used (for example `EADDRINUSE`). */
export class ListenError extends Error {
  override readonly name = 'ListenError';

  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Driving adapter for the socket voice: a TCP server that accepts any number of connections
 * and feeds each one through its own parser into `RecordSpeech`
 * (docs/speech-capture.md#listening-and-connections).
 */
export class TcpListener {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  constructor(
    private readonly recordSpeech: RecordSpeech,
    private readonly logger: Logger,
  ) {}

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: TcpSettings): Promise<number> {
    if (this.server) throw new Error('TCP listener is already running');
    const server = net.createServer((socket) => this.accept(socket, settings));

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        const reason =
          error.code === 'EADDRINUSE'
            ? 'the port is already in use (is another bridge running?)'
            : error.message;
        reject(
          new ListenError(
            `Cannot listen on ${settings.host}:${settings.port}: ${reason}`,
            error.code,
          ),
        );
      };
      server.once('error', onError);
      server.listen(settings.port, settings.host, () => {
        server.off('error', onError);
        resolve();
      });
    });

    server.on('error', (error) => this.logger.error(`TCP listener error: ${error.message}`));
    this.server = server;
    const port = (server.address() as net.AddressInfo).port;
    this.recordSpeech.listenerStarted({ host: settings.host, port, encoding: settings.encoding });
    return port;
  }

  /** Stops listening and closes all open connections. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const socket of this.sockets) socket.destroy();
    await closed;
    this.recordSpeech.listenerStopped();
  }

  private accept(socket: net.Socket, settings: TcpSettings): void {
    this.sockets.add(socket);
    const id = this.recordSpeech.connectionOpened();
    const parser = new TextToSocketParser(settings.encoding, settings.maxLineBytes, {
      header: (voice) => this.recordSpeech.setVoice(id, voice),
      line: (text) => this.recordSpeech.record(id, text),
      lineCut: (max) => this.logger.warn(`connection ${id}: line longer than ${max} bytes, cut it`),
    });

    socket.on('data', (chunk: Buffer) => parser.push(chunk));
    socket.on('error', (error) => this.logger.debug(`connection ${id}: ${error.message}`));
    socket.on('close', () => {
      parser.end();
      this.sockets.delete(socket);
      this.recordSpeech.connectionClosed(id);
    });
  }
}
