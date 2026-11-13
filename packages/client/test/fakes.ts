import type { BridgeApi, SpeechPage } from '../src/application/ports/out/bridge-api.js';
import type { Clock } from '../src/application/ports/out/clock.js';
import type {
  BridgeStatus,
  Session,
  SessionList,
  SessionRef,
  SpeechEntry,
  SpeechFeedEvent,
} from '../src/domain/speech-entry.js';
import { BridgeHttpError } from '../src/domain/errors.js';

/**
 * Virtual time: `sleep` advances `now` at once and runs the actions scheduled up to then, so
 * tests can say "speech arrives at 300 ms" without waiting.
 */
export class FakeClock implements Clock {
  private t = 0;
  private scheduled: { at: number; action: () => void }[] = [];
  readonly sleeps: number[] = [];

  now(): number {
    return this.t;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason as Error);
    this.sleeps.push(ms);
    this.t += ms;
    const due = this.scheduled.filter((s) => s.at <= this.t);
    this.scheduled = this.scheduled.filter((s) => s.at > this.t);
    for (const { action } of due.sort((a, b) => a.at - b.at)) action();
    return Promise.resolve();
  }

  /** Runs `action` once virtual time reaches `ms`. */
  at(ms: number, action: () => void): void {
    this.scheduled.push({ at: ms, action });
  }
}

/** One open live feed of {@link FakeBridgeApi}. */
class FakeStream {
  readonly queue: SpeechFeedEvent[] = [];
  ended: { error: Error | undefined } | undefined;
  wake: (() => void) | undefined;

  push(event: SpeechFeedEvent): void {
    if (this.ended) return; // the connection is gone
    this.queue.push(event);
    this.wake?.();
  }

  end(error?: Error): void {
    this.ended ??= { error };
    this.wake?.();
  }
}

/** An in-memory bridge: a seq counter that survives `clear`, sessions, live feeds and a call log. */
export class FakeBridgeApi implements BridgeApi {
  entries: SpeechEntry[] = [];
  private seq = 0;
  /** Every session started, oldest first (the fake never forgets one). */
  readonly allSessions: Session[] = [];
  private current: Session | undefined;
  apiVersion = '1.3';
  state: BridgeStatus['bridge']['state'] = 'ready';
  /** Page size the fake uses, whatever `limit` asks for, to test paging. */
  pageSize = Infinity;
  readonly calls: string[] = [];
  private readonly streams = new Set<FakeStream>();
  /** Makes the next calls reject with these errors, one per call. */
  failures: Error[] = [];

  /** Records a speech entry, as if the screen reader said `text`. */
  speak(...texts: string[]): void {
    for (const text of texts) this.add('speech', text);
  }

  status(): Promise<BridgeStatus> {
    this.calls.push('status');
    return this.fail() ?? Promise.resolve(this.snapshot());
  }

  listSpeech(query: { since: number; limit?: number; session?: SessionRef }): Promise<SpeechPage> {
    const { session } = query;
    this.calls.push(`list ${query.since}${session === undefined ? '' : ` session=${session}`}`);
    const failure = this.fail();
    if (failure) return failure;
    let sessionId: number | undefined;
    if (session !== undefined) {
      sessionId = session === 'current' ? this.current?.id : session;
      if (sessionId === undefined || !this.allSessions.some((s) => s.id === sessionId)) {
        return Promise.reject(new BridgeHttpError(404, 'NOT_FOUND', 'No such session'));
      }
    }
    const after = this.entries.filter(
      (e) => e.seq > query.since && (sessionId === undefined || e.sessionId === sessionId),
    );
    const size = Math.min(query.limit ?? 1000, this.pageSize);
    return Promise.resolve({
      entries: after.slice(0, size),
      truncated: false,
      hasMore: after.length > size,
    });
  }

  clear(): Promise<void> {
    this.calls.push('clear');
    const failure = this.fail();
    if (failure) return failure;
    this.entries = [];
    this.emit({ type: 'clear' });
    return Promise.resolve();
  }

  mark(label: string): Promise<SpeechEntry> {
    this.calls.push(`mark ${label}`);
    return this.fail() ?? Promise.resolve(this.add('marker', label));
  }

  startSession(request: { name: string; run?: string | undefined }): Promise<Session> {
    this.calls.push(`start ${request.name}`);
    const failure = this.fail();
    if (failure) return failure;
    this.endCurrent();
    const session: Session = {
      id: this.allSessions.length + 1,
      name: request.name,
      run: request.run ?? null,
      startedAt: new Date(0).toISOString(),
      endedAt: null,
      firstSeq: null,
      lastSeq: null,
      entries: 0,
    };
    this.allSessions.push(session);
    this.current = session;
    this.emit({ type: 'session', session: { ...session } });
    return Promise.resolve({ ...session });
  }

  endSession(): Promise<void> {
    this.calls.push('end');
    const failure = this.fail();
    if (failure) return failure;
    this.endCurrent();
    return Promise.resolve();
  }

  listSessions(): Promise<SessionList> {
    this.calls.push('sessions');
    const failure = this.fail();
    if (failure) return failure;
    return Promise.resolve({
      sessions: this.allSessions.map((s) => ({ ...s })).reverse(),
      currentId: this.current?.id ?? null,
    });
  }

  async *streamSpeech(options: {
    lastEventId: number | null;
    signal: AbortSignal;
  }): AsyncGenerator<SpeechFeedEvent> {
    const { lastEventId, signal } = options;
    this.calls.push(`stream ${lastEventId}`);
    await this.fail();
    const stream = new FakeStream();
    if (lastEventId !== null) {
      for (const entry of this.entries) {
        if (entry.seq > lastEventId) stream.push({ type: 'entry', entry });
      }
    }
    this.streams.add(stream);
    const close = () => stream.end();
    signal.addEventListener('abort', close, { once: true });
    try {
      for (;;) {
        const event = stream.queue.shift();
        if (event) {
          yield event;
          continue;
        }
        if (stream.ended) {
          if (stream.ended.error) throw stream.ended.error;
          return;
        }
        await new Promise<void>((resolve) => (stream.wake = resolve));
        stream.wake = undefined;
      }
    } finally {
      this.streams.delete(stream);
      signal.removeEventListener('abort', close);
    }
  }

  /** Number of open live feeds. */
  get openStreams(): number {
    return this.streams.size;
  }

  /** Sends `event` to every open live feed. */
  emit(event: SpeechFeedEvent): void {
    for (const stream of this.streams) stream.push(event);
  }

  /** Ends every open live feed after the events already sent, with `error` or normally. */
  dropStreams(error?: Error): void {
    for (const stream of this.streams) stream.end(error);
  }

  /** A new bridge: seq starts again at 1, the buffer is empty, open feeds drop. */
  restart(): void {
    this.seq = 0;
    this.entries = [];
    this.dropStreams(new Error('restarted'));
  }

  private add(kind: SpeechEntry['kind'], text: string): SpeechEntry {
    const entry: SpeechEntry = {
      seq: ++this.seq,
      kind,
      text,
      receivedAt: new Date(0).toISOString(),
      source: kind === 'speech' ? 'tcp' : 'api',
      voice: null,
      connectionId: kind === 'speech' ? 1 : null,
      sessionId: this.current?.id ?? null,
    };
    if (this.current) {
      this.current.firstSeq ??= entry.seq;
      this.current.lastSeq = entry.seq;
      this.current.entries++;
    }
    this.entries.push(entry);
    this.emit({ type: 'entry', entry });
    return entry;
  }

  private endCurrent(): void {
    if (!this.current) return;
    this.current.endedAt = new Date(0).toISOString();
    this.emit({ type: 'session', session: { ...this.current } });
    this.current = undefined;
  }

  private fail(): Promise<never> | undefined {
    const error = this.failures.shift();
    return error ? Promise.reject(error) : undefined;
  }

  private snapshot(): BridgeStatus {
    return {
      bridge: { version: '0.0.0', apiVersion: this.apiVersion, state: this.state },
      tcp: {
        listening: true,
        host: '127.0.0.1',
        port: 4449,
        encoding: 'windows-1252',
        connections: [],
      },
      buffer: {
        size: this.entries.length,
        maxEntries: 10_000,
        firstSeq: this.entries[0]?.seq ?? null,
        lastSeq: this.entries.at(-1)?.seq ?? null,
      },
      input: { enabled: false },
      session: {
        current: this.current ? { ...this.current } : null,
        count: this.allSessions.length,
      },
    };
  }
}
