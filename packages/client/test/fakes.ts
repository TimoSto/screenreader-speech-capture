import type { BridgeApi, SpeechPage } from '../src/application/ports/out/bridge-api.js';
import type { Clock } from '../src/application/ports/out/clock.js';
import type { BridgeStatus, SpeechEntry } from '../src/domain/speech-entry.js';

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

  sleep(ms: number): Promise<void> {
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

/** An in-memory bridge: a seq counter that survives `clear`, and a call log. */
export class FakeBridgeApi implements BridgeApi {
  entries: SpeechEntry[] = [];
  private seq = 0;
  apiVersion = '1.0';
  state: BridgeStatus['bridge']['state'] = 'ready';
  /** Page size the fake uses, whatever `limit` asks for, to test paging. */
  pageSize = Infinity;
  readonly calls: string[] = [];
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

  listSpeech(query: { since: number; limit?: number }): Promise<SpeechPage> {
    this.calls.push(`list ${query.since}`);
    const failure = this.fail();
    if (failure) return failure;
    const after = this.entries.filter((e) => e.seq > query.since);
    const size = Math.min(query.limit ?? 1000, this.pageSize);
    return Promise.resolve({
      entries: after.slice(0, size),
      truncated: false,
      hasMore: after.length > size,
    });
  }

  clear(): Promise<void> {
    this.calls.push('clear');
    this.entries = [];
    return this.fail() ?? Promise.resolve();
  }

  mark(label: string): Promise<SpeechEntry> {
    this.calls.push(`mark ${label}`);
    return this.fail() ?? Promise.resolve(this.add('marker', label));
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
    };
    this.entries.push(entry);
    return entry;
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
    };
  }
}
