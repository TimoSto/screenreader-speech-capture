import { describe, expect, it } from 'vitest';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from './errors.js';

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
    expect(plain.message).toBe('No speech matched "x" within 5 ms');
    const dropped = new SpeechTimeoutError('No speech matched "x" within 5 ms', [], true);
    expect(dropped.message).toMatch(/; some speech was dropped .*raise buffer\.maxEntries\)$/);
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
