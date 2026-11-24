import type {
  BridgeApi,
  CaptureRequest,
  InputCapture,
  SpeechPage,
  StreamEvent,
} from '../src/application/ports/out/bridge-api.js';
import type { Clock } from '../src/application/ports/out/clock.js';
import type { BridgeStatus } from '../src/domain/bridge-status.js';
import type { SpeechFeedEvent } from '../src/domain/feed-event.js';
import type { Session, SessionList, SessionRef, StartedSession } from '../src/domain/session.js';
import type { SpeechEntry } from '../src/domain/speech-entry.js';
import { BridgeHttpError } from '../src/domain/errors.js';

/**
 * Virtual time: `sleep` advances `now` and runs the actions scheduled up to then, so tests can say
 * "speech arrives at 300 ms" without waiting. After each action it lets pending I/O (live feeds)
 * run, and stops early, at that action's time, when `signal` aborts meanwhile: a wait that races
 * a timer against the feed ends at the time its speech arrived.
 */
export class FakeClock implements Clock {
  private t = 0;
  private scheduled: { at: number; action: () => void }[] = [];
  readonly sleeps: number[] = [];

  now(): number {
    return this.t;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason as Error;
    this.sleeps.push(ms);
    const target = this.t + ms;
    for (;;) {
      const due = this.scheduled.filter((s) => s.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.scheduled.splice(this.scheduled.indexOf(due), 1);
      this.t = Math.max(this.t, due.at);
      due.action();
      await new Promise((resolve) => setImmediate(resolve));
      if (signal?.aborted) throw signal.reason as Error;
    }
    this.t = Math.max(this.t, target);
  }

  /** Runs `action` once virtual time reaches `ms`. */
  at(ms: number, action: () => void): void {
    this.scheduled.push({ at: ms, action });
  }
}

/** One open live feed of {@link FakeBridgeApi}. */
class FakeStream {
  readonly queue: StreamEvent[] = [];
  ended: { error: Error | undefined } | undefined;
  wake: (() => void) | undefined;

  /** With `session`, only that session's entries (`?session=` of the real stream). */
  constructor(private readonly session?: number) {}

  push(event: StreamEvent): void {
    if (this.ended) return; // the connection is gone
    const other = this.session !== undefined && event.type === 'entry';
    if (other && event.entry.sessionId !== this.session) return;
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
  /** Highest `seq` dropped as if the buffer were full, since the last clear. */
  private droppedUpToSeq = 0;
  /** The client name this fake bridge sees on requests (`X-SR-Speech-Client`). */
  clientName: string | null = null;
  /** Every session started, oldest first (the fake never forgets one). */
  readonly allSessions: Session[] = [];
  private lastSessionId = 0;
  private current: Session | undefined;
  apiVersion = '1.4';
  state: BridgeStatus['bridge']['state'] = 'ready';
  /** Page size the fake uses, whatever `limit` asks for, to test paging. */
  pageSize = Infinity;
  readonly calls: string[] = [];
  private readonly streams = new Set<FakeStream>();
  /** Makes the next calls reject with these errors, one per call. */
  failures: Error[] = [];
  /** The virtual time captures (`captureKeys`, `captureClick`) run on. */
  clock: FakeClock | undefined;
  /** The `capture` of every capture request, oldest first. */
  readonly captures: CaptureRequest[] = [];

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
      truncated: query.since < this.droppedUpToSeq,
      hasMore: after.length > size,
    });
  }

  clear(session?: SessionRef | 'none'): Promise<void> {
    this.calls.push(session === undefined ? 'clear' : `clear ${String(session)}`);
    const failure = this.fail();
    if (failure) return failure;
    if (session !== undefined) {
      const id = session === 'none' ? null : session === 'current' ? this.current?.id : session;
      if (id === undefined) {
        return Promise.reject(new BridgeHttpError(404, 'NOT_FOUND', 'No session is current'));
      }
      if (id !== null && id !== this.current?.id) {
        return Promise.reject(
          new BridgeHttpError(400, 'INVALID_REQUEST', 'only the current session'),
        );
      }
      this.entries = this.entries.filter((e) => e.sessionId !== id);
      if (this.current && id === this.current.id) {
        this.current.entries = 0;
        this.current.firstSeq = null;
        this.current.lastSeq = null;
      }
      this.emit({ type: 'clear' });
      return Promise.resolve();
    }
    this.entries = [];
    this.droppedUpToSeq = 0;
    this.emit({ type: 'clear' });
    return Promise.resolve();
  }

  mark(label: string): Promise<SpeechEntry> {
    this.calls.push(`mark ${label}`);
    return this.fail() ?? Promise.resolve(this.add('marker', label));
  }

  startSession(request: { name: string; run?: string | undefined }): Promise<StartedSession> {
    this.calls.push(`start ${request.name}`);
    const failure = this.fail();
    if (failure) return failure;
    const previous = this.current;
    this.endCurrent();
    const session: Session = {
      id: ++this.lastSessionId,
      name: request.name,
      run: request.run ?? null,
      client: this.clientName,
      startedAt: new Date(0).toISOString(),
      endedAt: null,
      startSeq: this.seq,
      firstSeq: null,
      lastSeq: null,
      entries: 0,
    };
    this.allSessions.push(session);
    this.current = session;
    this.emit({ type: 'session', session: { ...session } });
    const replaced = previous && previous.client !== session.client ? { ...previous } : null;
    return Promise.resolve({ ...session, replaced });
  }

  endSession(): Promise<void> {
    this.calls.push('end');
    const failure = this.fail();
    if (failure) return failure;
    this.endCurrent();
    return Promise.resolve();
  }

  deleteSession(id: number): Promise<void> {
    this.calls.push(`delete ${id}`);
    const failure = this.fail();
    if (failure) return failure;
    const found = this.allSessions.find((s) => s.id === id);
    if (!found)
      return Promise.reject(new BridgeHttpError(404, 'NOT_FOUND', `Session ${id} does not exist`));
    if (found.id === this.current?.id) {
      return Promise.reject(
        new BridgeHttpError(400, 'INVALID_REQUEST', 'the current session cannot be deleted'),
      );
    }
    this.allSessions.splice(this.allSessions.indexOf(found), 1);
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

  click(request: { x: number; y: number; button?: string | undefined }): Promise<void> {
    this.calls.push(`click ${request.button ?? 'left'} ${request.x},${request.y}`);
    return this.fail() ?? Promise.resolve();
  }

  pressKeys(request: {
    keys: string | readonly string[];
    delayMs?: number | undefined;
  }): Promise<void> {
    const keys = typeof request.keys === 'string' ? request.keys : request.keys.join(' ');
    this.calls.push(
      `keys ${keys}${request.delayMs === undefined ? '' : ` delay=${request.delayMs}`}`,
    );
    return this.fail() ?? Promise.resolve();
  }

  captureClick(
    request: { x: number; y: number; button?: string | undefined } & { capture: CaptureRequest },
  ): Promise<InputCapture> {
    return this.capture(request.capture, () => this.click(request));
  }

  captureKeys(request: {
    keys: string | readonly string[];
    delayMs?: number | undefined;
    capture: CaptureRequest;
  }): Promise<InputCapture> {
    return this.capture(request.capture, () => this.pressKeys(request));
  }

  /**
   * Like the bridge: the start before the input, then the speech after it until it paused for
   * `quietForMs`, none came within `firstWithinMs`, or `timeoutMs` ran out (in 10 ms steps of
   * virtual time). `settleMs` is only recorded.
   */
  private async capture(capture: CaptureRequest, send: () => Promise<void>): Promise<InputCapture> {
    const clock = this.clock;
    if (!clock) throw new Error('FakeBridgeApi.clock is needed for a capture');
    this.captures.push(capture);
    const { quietForMs = 500, firstWithinMs = 2000, timeoutMs = 10_000 } = capture;
    const startSeq = this.seq;
    await send();
    const start = clock.now();
    const end = start + timeoutMs;
    const spoken = () => this.entries.filter((e) => e.seq > startSeq && e.kind === 'speech');
    let seen = 0;
    let last: number | undefined;
    for (;;) {
      const count = spoken().length;
      if (count > seen) {
        seen = count;
        last = clock.now();
      }
      const deadline = Math.min(
        last === undefined ? start + firstWithinMs : last + quietForMs,
        end,
      );
      if (clock.now() >= deadline) break;
      await clock.sleep(Math.min(10, deadline - clock.now()));
    }
    const status =
      last === undefined ? 'no-speech' : last + quietForMs <= end ? 'silent' : 'timeout';
    return { status, startSeq, entries: spoken(), omitted: 0, truncated: false };
  }

  async *streamSpeech(options: {
    lastEventId: number | null;
    session?: number | undefined;
    signal: AbortSignal;
  }): AsyncGenerator<StreamEvent> {
    const { lastEventId, session, signal } = options;
    this.calls.push(`stream ${lastEventId}${session === undefined ? '' : ` session=${session}`}`);
    await this.fail();
    if (session !== undefined && !this.allSessions.some((s) => s.id === session)) {
      throw new BridgeHttpError(404, 'NOT_FOUND', 'No such session');
    }
    const stream = new FakeStream(session);
    // Like the bridge: a cursor above every seq handed out is a gap, replayed from the start.
    const stale = lastEventId !== null && lastEventId > this.seq;
    const since = stale ? 0 : lastEventId;
    if (lastEventId === null) stream.push({ type: 'position', seq: this.seq });
    if (stale || (since !== null && since < this.droppedUpToSeq)) {
      stream.push({ type: 'truncated' });
    }
    if (since !== null) {
      for (const entry of this.entries) {
        if (entry.seq > since) stream.push({ type: 'entry', entry });
      }
    }
    this.streams.add(stream);
    const close = () => stream.end();
    // Like `fetch`, a signal that aborted before the connection ends it at once.
    if (signal.aborted) close();
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

  /** Drops the oldest `n` entries, as the bridge does when its buffer is full. */
  dropOldest(n: number): void {
    const dropped = this.entries.splice(0, n);
    const last = dropped.at(-1);
    if (last) this.droppedUpToSeq = last.seq;
  }

  /** Ends every open live feed after the events already sent, with `error` or normally. */
  dropStreams(error?: Error): void {
    for (const stream of this.streams) stream.end(error);
  }

  /**
   * A new bridge run: `seq` goes on from 1001 (the real bridge starts it at its start time),
   * session ids start again at 1, the buffer is empty, open feeds drop.
   */
  restart(): void {
    this.seq = 1000;
    this.entries = [];
    this.allSessions.length = 0;
    this.lastSessionId = 0;
    this.current = undefined;
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
      bridge: {
        version: '0.0.0',
        apiVersion: this.apiVersion,
        state: this.state,
        startedAt: new Date(0).toISOString(),
      },
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
      playwright: { state: 'stopped', version: '1.65.0', port: 3000, restarts: 0, exitCode: null },
      mcp: { state: 'stopped', version: '0.0.85', port: 8931, restarts: 0, exitCode: null },
      session: {
        current: this.current ? { ...this.current } : null,
        count: this.allSessions.length,
      },
    };
  }
}
