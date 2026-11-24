import { describe, expect, it } from 'vitest';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SEEN_IN_MESSAGE,
  SpeechTimeoutError,
} from './errors.js';
import type { SpeechEntry } from './speech-entry.js';

describe('client errors', () => {
  it('BridgeUnreachableError names the socket error code fetch wraps', () => {
    const cause = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const error = new BridgeUnreachableError('http://vm:5151', { cause });
    expect(error.message).toBe('The bridge at http://vm:5151 is not reachable (ECONNREFUSED)');
    expect(error.url).toBe('http://vm:5151');
    expect(error.cause).toBe(cause);
  });

  it('BridgeUnreachableError names a nested error message, or the error itself', () => {
    const nested = new TypeError('fetch failed', { cause: new Error('bad port') });
    expect(new BridgeUnreachableError('u', { cause: nested }).message).toBe(
      'The bridge at u is not reachable (bad port)',
    );
    expect(new BridgeUnreachableError('u', { cause: new Error('timed out') }).message).toBe(
      'The bridge at u is not reachable (timed out)',
    );
    expect(new BridgeUnreachableError('u').message).toBe('The bridge at u is not reachable');
  });

  it('BridgeHttpError adds status and code to the message', () => {
    const error = new BridgeHttpError(400, 'INVALID_REQUEST', 'limit: bad', { field: 'limit' });
    expect(error.message).toBe('limit: bad (HTTP 400, INVALID_REQUEST)');
    expect(error.details).toEqual({ field: 'limit' });
  });

  it('IncompatibleBridgeError says to install matching versions by default', () => {
    const error = new IncompatibleBridgeError('2.0', '1.3');
    expect(error.message).toBe(
      'The bridge speaks API 2.0, this client needs API 1.3. Install the bridge and the client in the same version.',
    );
    expect([error.bridgeApiVersion, error.clientApiVersion]).toEqual(['2.0', '1.3']);
  });

  it('SpeechTimeoutError adds the buffer hint only when speech was dropped', () => {
    const plain = new SpeechTimeoutError('No speech matched "x" within 5 ms', []);
    expect(plain.truncated).toBe(false);
    expect(plain.reason).toBe('No speech matched "x" within 5 ms');
    const dropped = new SpeechTimeoutError('No speech matched "x" within 5 ms', [], true);
    expect(dropped.reason).toMatch(/; some speech was dropped .*raise buffer\.maxEntries\)$/);
  });

  it('SpeechTimeoutError lists the speech seen in its message, the last ones only', () => {
    const entry = (
      seq: number,
      text: string,
      kind: SpeechEntry['kind'] = 'speech',
    ): SpeechEntry => ({
      seq,
      kind,
      text,
      receivedAt: '2026-01-01T00:00:00.000Z',
      source: 'tcp',
      voice: null,
      connectionId: null,
      sessionId: null,
    });
    expect(new SpeechTimeoutError('No speech matched "x" within 5 ms', []).message).toBe(
      'No speech matched "x" within 5 ms. No speech arrived.',
    );
    expect(
      new SpeechTimeoutError('No speech matched "x" within 5 ms', [
        entry(3, 'Kontakt Überschrift Ebene 1'),
        entry(4, 'm', 'marker'),
      ]).message,
    ).toBe(
      'No speech matched "x" within 5 ms. Speech seen (2):\n' +
        '  #3 Kontakt Überschrift Ebene 1\n  #4 [marker] m',
    );
    const many = Array.from({ length: SEEN_IN_MESSAGE + 5 }, (_, i) => entry(i + 1, `e${i + 1}`));
    const lines = new SpeechTimeoutError('x', many).message.split('\n');
    expect(lines[0]).toBe(`x. Speech seen (${SEEN_IN_MESSAGE + 5}):`);
    expect(lines[1]).toBe('  … 5 earlier (in error.entries)');
    expect(lines[2]).toBe('  #6 e6');
    expect(lines).toHaveLength(SEEN_IN_MESSAGE + 2);
  });

  it('every error has its class name', () => {
    expect(
      [
        new SpeechTimeoutError('x', []),
        new BridgeHttpError(500, 'INTERNAL', 'x'),
        new BridgeUnreachableError('u'),
        new IncompatibleBridgeError('2.0', '1.3'),
      ].map((e) => e.name),
    ).toEqual([
      'SpeechTimeoutError',
      'BridgeHttpError',
      'BridgeUnreachableError',
      'IncompatibleBridgeError',
    ]);
  });
});
