import type { Clock, TimerHandle } from '../src/application/ports/out/clock.js';
import type { IdGenerator } from '../src/application/ports/out/id-generator.js';
import type { Logger } from '../src/application/ports/out/logger.js';

/** Clock under test control: time only moves with `advance()`. */
export class FakeClock implements Clock {
  private time = Date.parse('2026-11-07T14:00:00.000Z');
  private monotonic = 1000;
  private timers: { at: number; callback: () => void; handle: number }[] = [];
  private nextHandle = 1;

  now(): Date {
    return new Date(this.time);
  }

  monotonicMs(): number {
    return this.monotonic;
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const handle = this.nextHandle++;
    this.timers.push({ at: this.monotonic + ms, callback, handle });
    return handle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((timer) => timer.handle !== handle);
  }

  advance(ms: number): void {
    this.time += ms;
    this.monotonic += ms;
    const due = this.timers.filter((timer) => timer.at <= this.monotonic);
    this.timers = this.timers.filter((timer) => timer.at > this.monotonic);
    for (const timer of due) timer.callback();
  }

  pendingTimers(): number {
    return this.timers.length;
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next(): string {
    return `id-${++this.n}`;
  }
}

/** Logger that keeps its messages, as `"<level> <message>"`. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  error = (message: string) => void this.lines.push(`error ${message}`);
  warn = (message: string) => void this.lines.push(`warn ${message}`);
  info = (message: string) => void this.lines.push(`info ${message}`);
  debug = (message: string) => void this.lines.push(`debug ${message}`);
}
