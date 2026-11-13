import net from 'node:net';
import type { RecordSpeech } from '../../../application/ports/in/record-speech.js';
import type { CaptureStatusSource } from '../../../application/ports/out/capture-status.js';
import type { Clock } from '../../../application/ports/out/clock.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { CaptureStatus, ConnectionInfo, ListenerState } from '../../../domain/capture.js';
import type { Config } from '../../../domain/config/index.js';
import { listen } from '../../shared/net/listen.js';
import { TextToSocketParser } from './text-to-socket-parser.js';

export type TcpSettings = Config['tcp'];

/**
 * Driving adapter for the socket voice: a TCP server that accepts any number of connections
 * and feeds each one through its own parser into `RecordSpeech`
 * (docs/speech-capture.md#listening-and-connections). Also reports the listener and its open
 * connections for the status.
 */
export class TcpListener implements CaptureStatusSource {
  private server: net.Server | null = null;
  private settings: TcpSettings | null = null;
  /** The open sockets of each server, so closing one server only ends its own connections. */
  private readonly sockets = new Map<net.Server, Set<net.Socket>>();
  private readonly open = new Map<number, ConnectionInfo>();
  private nextConnectionId = 1;
  private listener: ListenerState | null = null;

  constructor(
    private readonly recordSpeech: RecordSpeech,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  captureStatus(): CaptureStatus {
    return {
      listener: this.listener && { ...this.listener },
      connections: [...this.open.values()].map((connection) => ({ ...connection })),
    };
  }

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: TcpSettings): Promise<number> {
    if (this.server) throw new Error('TCP listener is already running');
    return this.bind(settings);
  }

  /**
   * Moves the listener to new settings (`PUT /api/v1/config`) and resolves with the bound port.
   * Open connections are closed; the socket voice reconnects.
   *
   * A new port is bound before the old server stops, so a port that is in use leaves everything
   * as it was. The same port on another host can't be bound while the old server holds it: then
   * the old server stops listening first, and starts again if the new address fails.
   */
  async restart(settings: TcpSettings): Promise<number> {
    const old = this.server;
    const previous = this.settings;
    if (!old || !previous) return this.start(settings);

    if (settings.port === 0 || settings.port !== previous.port) {
      const port = await this.bind(settings, old);
      await this.close(old);
      return port;
    }

    this.server = null;
    await this.close(old);
    try {
      return await this.bind(settings);
    } catch (error) {
      await this.bind(previous);
      throw error;
    }
  }

  /** Stops listening and closes all open connections. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    this.settings = null;
    await this.close(server);
    if (this.listener) this.listener = { ...this.listener, listening: false };
    this.logger.info('stopped listening');
  }

  /** Listens on `settings` with a new server, which then replaces `replacing` (if any). */
  private async bind(settings: TcpSettings, replacing: net.Server | null = null): Promise<number> {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => this.accept(socket, settings, sockets));
    const port = await listen(server, settings.host, settings.port);
    server.on('error', (error) => this.logger.error(`TCP listener error: ${error.message}`));
    if (this.server !== replacing) {
      // Started or stopped meanwhile: this server is not needed.
      server.close();
      throw new Error('TCP listener changed while it was being restarted');
    }
    this.sockets.set(server, sockets);
    this.server = server;
    this.settings = { ...settings, port };
    this.listener = { listening: true, host: settings.host, port, encoding: settings.encoding };
    this.logger.info(`listening on ${settings.host}:${port}, encoding ${settings.encoding}`);
    return port;
  }

  /** Closes `server` and its open connections. */
  private async close(server: net.Server): Promise<void> {
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const socket of this.sockets.get(server) ?? []) socket.destroy();
    this.sockets.delete(server);
    await closed;
  }

  private accept(socket: net.Socket, settings: TcpSettings, sockets: Set<net.Socket>): void {
    sockets.add(socket);
    const id = this.nextConnectionId++;
    const connection: ConnectionInfo = { id, voice: null, connectedAt: this.clock.now() };
    this.open.set(id, connection);
    this.logger.info(`connection ${id} opened`);

    const parser = new TextToSocketParser(settings.encoding, settings.maxLineBytes, {
      header: (voice) => {
        connection.voice = voice;
        this.logger.info(`connection ${id}: voice=${voice}`);
      },
      line: (text) => this.recordSpeech.record({ text, voice: connection.voice, connectionId: id }),
      lineCut: (max) => this.logger.warn(`connection ${id}: line longer than ${max} bytes, cut it`),
    });

    socket.on('data', (chunk: Buffer) => parser.push(chunk));
    socket.on('error', (error) => this.logger.debug(`connection ${id}: ${error.message}`));
    socket.on('close', () => {
      parser.end();
      sockets.delete(socket);
      this.open.delete(id);
      this.logger.info(`connection ${id} closed`);
    });
  }
}
