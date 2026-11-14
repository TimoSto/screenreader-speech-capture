import { describe, expect, it } from 'vitest';
import type { SpeechEvent } from '../../../domain/speech-event.js';
import { InProcessEventBus } from './in-process-event-bus.js';

const clear: SpeechEvent = { type: 'clear' };

describe('InProcessEventBus', () => {
  it('delivers each event to every listener, synchronously', () => {
    const bus = new InProcessEventBus();
    const a: SpeechEvent[] = [];
    const b: SpeechEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.publish(clear);
    expect(a).toEqual([clear]);
    expect(b).toEqual([clear]);
  });

  it('delivers in publish order (the SpeechEventBus contract)', () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe((e) => seen.push(e.type));
    bus.publish(clear);
    bus.publish({ type: 'session', session: {} as never });
    bus.publish(clear);
    expect(seen).toEqual(['clear', 'session', 'clear']);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new InProcessEventBus();
    const seen: SpeechEvent[] = [];
    const unsubscribe = bus.subscribe((e) => seen.push(e));
    unsubscribe();
    bus.publish(clear);
    expect(seen).toEqual([]);
  });

  it('reports a failing listener and still calls the others', () => {
    const errors: unknown[] = [];
    const bus = new InProcessEventBus((error) => errors.push(error));
    const seen: SpeechEvent[] = [];
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((e) => seen.push(e));
    bus.publish(clear);
    expect(seen).toEqual([clear]);
    expect(errors).toEqual([new Error('boom')]);
  });

  it('lets a listener unsubscribe itself while an event is delivered', () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe(() => {
      seen.push('once');
      unsubscribe();
    });
    bus.subscribe(() => seen.push('always'));
    bus.publish(clear);
    bus.publish(clear);
    expect(seen).toEqual(['once', 'always', 'always']);
  });
});
