import net from 'node:net';
import type { RecordSpeech } from '../../../application/ports/in/record-speech.js';
import type { TrackCapture } from '../../../application/ports/in/track-capture.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { Config } from '../../../domain/config/index.js';
import { listen } from '../../shared/net/listen.js';
import { TextToSocketParser } from './text-to-socket-parser.js';

export type TcpSettings = Config['tcp'];

/**
 * Driving adapter for the socket voice: a TCP server that accepts any number of connections
 * and feeds each one through its own parser into `RecordSpeech`
 * (docs/speech-capture.md#listening-and-connections). Reports its listener and connections to
 * `TrackCapture`, for the status.
 */
export class TcpListener {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();
  private nextConnectionId = 1;

  constructor(
    private readonly recordSpeech: RecordSpeech,
    private readonly track: TrackCapture,
    private readonly logger: Logger,
  ) {}

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: TcpSettings): Promise<number> {
    if (this.server) throw new Error('TCP listener is already running');
    const server = net.createServer((socket) => this.accept(socket, settings));
    const port = await listen(server, settings.host, settings.port);
    server.on('error', (error) => this.logger.error(`TCP listener error: ${error.message}`));
    this.server = server;
    this.track.listening({ host: settings.host, port, encoding: settings.encoding });
    this.logger.info(`listening on ${settings.host}:${port}, encoding ${settings.encoding}`);
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
    this.track.stoppedListening();
    this.logger.info('stopped listening');
  }

  private accept(socket: net.Socket, settings: TcpSettings): void {
    this.sockets.add(socket);
    const id = this.nextConnectionId++;
    let voice: string | null = null;
    this.track.connectionOpened(id);
    this.logger.info(`connection ${id} opened`);

    const parser = new TextToSocketParser(settings.encoding, settings.maxLineBytes, {
      header: (header) => {
        voice = header;
        this.track.voiceIdentified(id, header);
        this.logger.info(`connection ${id}: voice=${header}`);
      },
      line: (text) => this.recordSpeech.record({ text, voice, connectionId: id }),
      lineCut: (max) => this.logger.warn(`connection ${id}: line longer than ${max} bytes, cut it`),
    });

    socket.on('data', (chunk: Buffer) => parser.push(chunk));
    socket.on('error', (error) => this.logger.debug(`connection ${id}: ${error.message}`));
    socket.on('close', () => {
      parser.end();
      this.sockets.delete(socket);
      this.track.connectionClosed(id);
      this.logger.info(`connection ${id} closed`);
    });
  }
}
