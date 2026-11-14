import { describe, expect, it } from 'vitest';
import type { BridgeStatus } from '../../../domain/bridge-status.js';
import type { Session } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import {
  SOURCE_LABEL,
  formatEntry,
  formatSession,
  formatSessionEvent,
  formatStatus,
  seenText,
} from './format.js';

function entry(seq: number, text: string, kind: SpeechEntry['kind'] = 'speech'): SpeechEntry {
  return {
    seq,
    kind,
    text,
    receivedAt: '2026-01-01T00:00:00.000Z',
    source: 'tcp',
    voice: null,
    connectionId: null,
    sessionId: null,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 2,
    name: 'checkout',
    run: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    firstSeq: null,
    lastSeq: null,
    entries: 0,
    ...overrides,
  };
}

function status(overrides: Partial<BridgeStatus> = {}): BridgeStatus {
  return {
    bridge: {
      version: '1.4.0',
      apiVersion: '1.4',
      state: 'ready',
      startedAt: '2026-11-12T09:00:00.000Z',
    },
    tcp: {
      listening: true,
      host: '127.0.0.1',
      port: 4449,
      encoding: 'windows-1252',
      connections: [],
    },
    buffer: { size: 0, maxEntries: 10000, firstSeq: null, lastSeq: null },
    playwright: { state: 'stopped', version: '1.65.0', port: 3000, restarts: 0, exitCode: null },
    mcp: { state: 'stopped', version: '0.0.85', port: 8931, restarts: 0, exitCode: null },
    input: { enabled: false },
    session: { current: null, count: 0 },
    ...overrides,
  };
}

describe('formatEntry', () => {
  it('prints seq and text, and flags markers', () => {
    expect(formatEntry(entry(3, 'Submit, button'))).toBe('#3 Submit, button');
    expect(formatEntry(entry(4, 'step-2', 'marker'))).toBe('#4 [marker] step-2');
  });
});

describe('formatSession', () => {
  it('prints an empty current session', () => {
    expect(formatSession(session(), true)).toBe('#2 checkout: current, 0 entries');
  });

  it('prints the run, singular entry and the seq range of an ended session', () => {
    expect(
      formatSession(session({ run: 'nightly', entries: 1, firstSeq: 5, lastSeq: 5 }), false),
    ).toBe('#2 checkout (run nightly): ended, 1 entry, seq 5-5');
  });

  it('falls back to firstSeq when lastSeq is missing', () => {
    expect(formatSession(session({ entries: 3, firstSeq: 7 }), false)).toBe(
      '#2 checkout: ended, 3 entries, seq 7-7',
    );
  });
});

describe('formatSessionEvent', () => {
  it('says started or ended and quotes the name', () => {
    expect(formatSessionEvent(session({ name: 'a "b"' }))).toBe(
      '--- session #2 "a \\"b\\"" started ---',
    );
    expect(formatSessionEvent(session({ endedAt: '2026-01-01T00:01:00.000Z' }))).toBe(
      '--- session #2 "checkout" ended ---',
    );
  });
});

describe('seenText', () => {
  it('says when nothing arrived', () => {
    expect(seenText([])).toBe(' No speech arrived.');
  });

  it('lists the entries, indented', () => {
    expect(seenText([entry(1, 'one'), entry(2, 'm', 'marker')])).toBe(
      ' Speech seen:\n  #1 one\n  #2 [marker] m',
    );
  });
});

describe('formatStatus', () => {
  it('prints an empty bridge', () => {
    expect(formatStatus(status())).toBe(
      [
        'bridge  1.4.0 (API 1.4), ready',
        'tcp     127.0.0.1:4449 listening, 0 voice connections, windows-1252',
        'buffer  0 of 10000 entries (empty)',
        'input   disabled',
        'session none current, 0 in the buffer',
      ].join('\n'),
    );
  });

  it('prints connections, the buffer range, input and the current session', () => {
    const text = formatStatus(
      status({
        tcp: {
          listening: false,
          host: '0.0.0.0',
          port: 4450,
          encoding: 'utf-8',
          connections: [{ id: 1, voice: null, connectedAt: '2026-01-01T00:00:00.000Z' }],
        },
        buffer: { size: 3, maxEntries: 10, firstSeq: 4, lastSeq: 6 },
        input: { enabled: true },
        session: { current: session(), count: 2 },
      }),
    );
    expect(text).toContain('tcp     0.0.0.0:4450 not listening, 1 voice connection, utf-8');
    expect(text).toContain('buffer  3 of 10 entries (seq 4-6)');
    expect(text).toContain('input   enabled');
    expect(text).toContain('session #2 checkout, 2 in the buffer');
  });

  it('says when no session is current', () => {
    expect(formatStatus(status({ session: { current: null, count: 0 } }))).toContain(
      'session none current, 0 in the buffer',
    );
  });
});

it('labels every config value source', () => {
  expect(SOURCE_LABEL).toEqual({
    explicit: '--url',
    env: 'SR_SPEECH_URL',
    config: 'config file',
    default: 'default',
  });
});
