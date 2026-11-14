import { describe, expect, it } from 'vitest';
import { CaptureState } from './capture.js';

const at = (ms: number) => new Date(ms);

describe('CaptureState', () => {
  it('has no listener and no connections before the start', () => {
    expect(new CaptureState().captureStatus()).toEqual({ listener: null, connections: [] });
  });

  it('reports the listener, and keeps its address once it stops', () => {
    const state = new CaptureState();
    state.listening({ host: '0.0.0.0', port: 4449, encoding: 'utf-8' });
    expect(state.captureStatus().listener).toEqual({
      listening: true,
      host: '0.0.0.0',
      port: 4449,
      encoding: 'utf-8',
    });
    state.stoppedListening();
    expect(state.captureStatus().listener).toMatchObject({ listening: false, port: 4449 });
  });

  it('lists the open connections oldest first, with their voice, and forgets closed ones', () => {
    const state = new CaptureState();
    state.connectionOpened(1, at(1));
    state.connectionOpened(2, at(2));
    state.voiceIdentified(2, 'ssc5000');
    state.voiceIdentified(9, 'unknown');
    expect(state.captureStatus().connections).toEqual([
      { id: 1, voice: null, connectedAt: at(1) },
      { id: 2, voice: 'ssc5000', connectedAt: at(2) },
    ]);
    state.connectionClosed(1);
    expect(state.captureStatus().connections.map((c) => c.id)).toEqual([2]);
  });

  it('returns copies', () => {
    const state = new CaptureState();
    state.connectionOpened(1, at(1));
    state.captureStatus().connections[0]!.voice = 'changed';
    expect(state.captureStatus().connections[0]!.voice).toBeNull();
  });
});
