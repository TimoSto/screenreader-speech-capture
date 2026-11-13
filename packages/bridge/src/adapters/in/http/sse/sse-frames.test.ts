import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../../../../domain/session.js';
import type { SpeechEntry } from '../../../../domain/speech-entry.js';
import { bridgeFrame, sseFrame } from './sse-frames.js';

const entry: SpeechEntry = {
  seq: 7,
  kind: 'speech',
  text: 'OK button',
  receivedAt: new Date('2026-01-02T03:04:05.000Z'),
  source: 'tcp',
  voice: 'JAWS',
  connectionId: 1,
  sessionId: null,
};

const session: SessionSummary = {
  id: 2,
  name: 'login',
  run: null,
  startedAt: new Date('2026-01-02T03:04:05.000Z'),
  endedAt: null,
  firstSeq: null,
  lastSeq: null,
  entries: 0,
};

/** The `field: value` lines of one frame. */
function lines(frame: string): string[] {
  expect(frame.endsWith('\n\n')).toBe(true);
  return frame.slice(0, -2).split('\n');
}

describe('sseFrame', () => {
  it('gives an entry its seq as id, so a reconnect resumes after it', () => {
    const [id, event, data] = lines(sseFrame({ type: 'entry', entry }));
    expect(id).toBe('id: 7');
    expect(event).toBe('event: entry');
    expect(JSON.parse(data!.slice('data: '.length))).toMatchObject({
      seq: 7,
      text: 'OK button',
      receivedAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('sends a session without id, so Last-Event-ID stays on the last entry', () => {
    const frame = lines(sseFrame({ type: 'session', session }));
    expect(frame).toHaveLength(2);
    expect(frame[0]).toBe('event: session');
    expect(JSON.parse(frame[1]!.slice('data: '.length))).toMatchObject({ id: 2, name: 'login' });
  });

  it.each(['clear', 'truncated'] as const)('sends %s with empty data and no id', (type) => {
    expect(sseFrame({ type })).toBe(`event: ${type}\ndata: {}\n\n`);
  });
});

describe('bridgeFrame', () => {
  it('sends the instance id without id, so Last-Event-ID stays on the last entry', () => {
    expect(bridgeFrame('run-1')).toBe('event: bridge\ndata: {"instanceId":"run-1"}\n\n');
  });
});
