import type { SpeechEntry } from '../../domain/speech-entry.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import {
  CAPTURE_LIMITS,
  type CaptureInput,
  type CaptureOptions,
  type CaptureRequest,
  type InputCaptureResult,
} from '../ports/in/capture-input.js';
import type { Shutdown } from '../ports/in/lifecycle.js';
import type { WatchEvent } from '../ports/in/speech.js';
import type {
  ClickRequest,
  InputHooks,
  PressKeysRequest,
  SendNativeInput,
} from '../ports/in/send-native-input.js';
import type { Clock } from '../ports/out/clock.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import { abortReason, shuttingDown } from '../shared/abort.js';
import { followLog, type FollowOptions } from '../shared/follow-log.js';
import { intOption } from '../shared/int-option.js';

interface InputCaptureDeps {
  input: SendNativeInput;
  log: Pick<SpeechLog, 'page' | 'headSeq'>;
  events: SpeechEventBus;
  clock: Clock;
  /** A new `pace` for each look through the buffer (see `FollowOptions`), as for the wait. */
  pace?: (() => FollowOptions['pace']) | undefined;
}

type Options = Required<{ [K in keyof CaptureOptions]: number }>;

function parseOptions(options: CaptureOptions): Options {
  const { quietForMs, firstWithinMs, timeoutMs, settleMs } = CAPTURE_LIMITS;
  const ms = (
    field: keyof CaptureOptions,
    limits: { default: number; max: number; min?: number },
  ): number =>
    intOption(`capture.${field}`, options[field], {
      fallback: limits.default,
      min: limits.min ?? 0,
      max: limits.max,
    });
  return {
    quietForMs: ms('quietForMs', quietForMs),
    firstWithinMs: ms('firstWithinMs', firstWithinMs),
    timeoutMs: ms('timeoutMs', timeoutMs),
    settleMs: ms('settleMs', settleMs),
  };
}

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/**
 * Native input that records the speech it causes (docs/usage/native-input.md#capturing-the-speech-an-input-causes).
 * The start `seq` is read in the input queue right before the input is sent, so no other input
 * and no speech that came before it gets into the capture; silence is timed from the entries'
 * `receivedAt`, on the bridge's clock, not from when a client got them.
 */
export class InputCaptureService implements CaptureInput, Shutdown {
  private readonly pending = new Set<AbortController>();
  private closed = false;

  constructor(private readonly deps: InputCaptureDeps) {}

  click({ capture, signal, ...request }: ClickRequest & CaptureRequest) {
    return this.run(capture, signal, (hooks) => this.deps.input.click(request, hooks));
  }

  pressKeys({ capture, signal, ...request }: PressKeysRequest & CaptureRequest) {
    return this.run(capture, signal, (hooks) => this.deps.input.pressKeys(request, hooks));
  }

  /**
   * Rejects all pending captures, and every later one, with `SERVICE_UNAVAILABLE`. The `Shutdown`
   * lifecycle port: only the composition root calls it.
   */
  shutdown(): void {
    this.closed = true;
    for (const stop of [...this.pending]) stop.abort(shuttingDown());
  }

  private async run(
    capture: CaptureOptions,
    signal: AbortSignal | undefined,
    send: (hooks: InputHooks) => Promise<void>,
  ): Promise<InputCaptureResult> {
    if (this.closed) throw shuttingDown();
    const options = parseOptions(capture);
    if (signal?.aborted) throw abortReason(signal);
    const stop = new AbortController();
    const onAbort = () => stop.abort(abortReason(signal!));
    signal?.addEventListener('abort', onAbort, { once: true });
    this.pending.add(stop);
    try {
      let startSeq = 0;
      await send({
        beforeInject: async () => {
          if (options.settleMs > 0) await this.settle(options, stop.signal);
          if (stop.signal.aborted) throw abortReason(stop.signal);
          startSeq = this.deps.log.headSeq;
        },
      });
      return await this.record(startSeq, options, stop.signal);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.pending.delete(stop);
    }
  }

  /**
   * Waits until the newest speech is `settleMs` old, at most `timeoutMs`: after that the input
   * is sent anyway, and the trailing speech shows in the capture.
   */
  private async settle({ settleMs, timeoutMs }: Options, signal: AbortSignal): Promise<void> {
    const { log } = this.deps;
    const start = this.now();
    const newest = log.page(log.headSeq - 1, 1).entries[0];
    let last = newest?.kind === 'speech' ? newest.receivedAt.getTime() : undefined;
    if (last === undefined || last + settleMs <= start) return;
    await this.follow(
      null,
      signal,
      () => Math.min(last! + settleMs, start + timeoutMs),
      (event) => {
        if (event.type === 'entry' && event.entry.kind === 'speech') {
          last = event.entry.receivedAt.getTime();
        }
      },
    );
  }

  /** Follows the speech after `startSeq` until it paused, none came, or the time ran out. */
  private async record(
    startSeq: number,
    { quietForMs, firstWithinMs, timeoutMs }: Options,
    signal: AbortSignal,
  ): Promise<InputCaptureResult> {
    const sentAt = this.now();
    const end = sentAt + timeoutMs;
    const entries: SpeechEntry[] = [];
    let omitted = 0;
    let truncated = false;
    let last: number | undefined;
    // Speech received while the input was sent is in the log already: the replay hands it over,
    // and it counts as the first speech.
    const deadline = () =>
      Math.min(last === undefined ? sentAt + firstWithinMs : last + quietForMs, end);
    await this.follow(startSeq, signal, deadline, (event) => {
      if (event.type === 'truncated') truncated = true;
      if (event.type !== 'entry' || event.entry.kind !== 'speech') return;
      last = event.entry.receivedAt.getTime();
      if (entries.length < CAPTURE_LIMITS.entries) entries.push(event.entry);
      else omitted++;
    });
    // Timers may fire a little early, so the status comes from the entries' times, not `now()`.
    const status =
      last === undefined ? 'no-speech' : last + quietForMs <= end ? 'silent' : 'timeout';
    return { status, startSeq, entries, omitted, truncated };
  }

  /**
   * Hands `onEvent` the log's events after `since` (`null`: only new ones) until `deadline()`
   * (ms, read again after each speech entry) has passed. Rejects when `signal` aborts.
   */
  private follow(
    since: number | null,
    signal: AbortSignal,
    deadline: () => number,
    onEvent: (event: WatchEvent) => void,
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise<void>((resolve, reject) => {
      let done = false;
      let timer: AbortController | undefined;
      let stopFollow: (() => void) | undefined;
      const finish = () => {
        done = true;
        stopFollow?.();
        timer?.abort();
        signal.removeEventListener('abort', onAbort);
      };
      const fail = (error: Error) => {
        if (done) return;
        finish();
        reject(error);
      };
      const onAbort = () => fail(abortReason(signal));
      const arm = () => {
        timer?.abort();
        const own = new AbortController();
        timer = own;
        this.deps.clock.sleep(Math.max(0, deadline() - this.now()), own.signal).then(
          () => {
            if (done || timer !== own) return;
            finish();
            resolve();
          },
          () => {
            // Re-armed, or ended before the time ran out.
          },
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
      arm();
      try {
        stopFollow = followLog(
          this.deps,
          { since, sessionId: undefined },
          (event) => {
            if (done) return;
            onEvent(event);
            if (event.type === 'entry' && event.entry.kind === 'speech') arm();
          },
          { pace: this.deps.pace?.(), onError: (error) => fail(toError(error)) },
        );
        if (done) stopFollow();
      } catch (error) {
        fail(toError(error));
      }
    });
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
