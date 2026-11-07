import type { ConnectionInfo } from '../ports/in/get-status.js';
import type { RecordSpeech } from '../ports/in/record-speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { Logger } from '../ports/out/logger.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

export interface ListenerState {
  listening: boolean;
  host: string;
  port: number;
  encoding: string;
}

export interface RecordSpeechDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
  clock: Clock;
  logger: Logger;
  /** Receives the recorded text. Kept apart from `logger` so it can stay off the console. */
  transcript: Logger;
}

/**
 * Turns lines from the socket voice into speech entries (docs/speech-capture.md#from-line-to-speech-entry)
 * and keeps track of the listener and its open connections for the status.
 */
export class RecordSpeechService implements RecordSpeech {
  private readonly open = new Map<number, ConnectionInfo>();
  private nextConnectionId = 1;
  private listener: ListenerState | null = null;

  constructor(private readonly deps: RecordSpeechDeps) {}

  listenerStarted(info: { host: string; port: number; encoding: string }): void {
    this.listener = { listening: true, ...info };
    this.deps.logger.info(`listening on ${info.host}:${info.port}, encoding ${info.encoding}`);
  }

  listenerStopped(): void {
    if (this.listener) this.listener = { ...this.listener, listening: false };
    this.deps.logger.info('stopped listening');
  }

  connectionOpened(): number {
    const id = this.nextConnectionId++;
    this.open.set(id, { id, voice: null, connectedAt: this.deps.clock.now() });
    this.deps.logger.info(`connection ${id} opened`);
    return id;
  }

  setVoice(connectionId: number, voice: string): void {
    const connection = this.open.get(connectionId);
    if (connection) connection.voice = voice;
    this.deps.logger.info(`connection ${connectionId}: voice=${voice}`);
  }

  record(connectionId: number, text: string): void {
    const { repository, events, clock, transcript } = this.deps;
    const entry = repository.add({
      kind: 'speech',
      text,
      receivedAt: clock.now(),
      source: 'tcp',
      voice: this.open.get(connectionId)?.voice ?? null,
      connectionId,
    });
    transcript.debug(`#${entry.seq} (connection ${connectionId}) ${text}`);
    events.publish({ type: 'entry', entry });
  }

  connectionClosed(connectionId: number): void {
    this.open.delete(connectionId);
    this.deps.logger.info(`connection ${connectionId} closed`);
  }

  /** The listener, or `null` before it was started for the first time. */
  listenerState(): ListenerState | null {
    return this.listener && { ...this.listener };
  }

  /** Open connections, oldest first. */
  connections(): ConnectionInfo[] {
    return [...this.open.values()].map((connection) => ({ ...connection }));
  }
}
