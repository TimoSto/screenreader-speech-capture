import type { CaptureState } from '../../domain/capture.js';
import type { TrackCapture } from '../ports/in/track-capture.js';
import type { Clock } from '../ports/out/clock.js';

export interface CaptureServiceDeps {
  state: CaptureState;
  clock: Pick<Clock, 'now'>;
}

/** Keeps the capture state the status reports, from what the capture adapters tell it. */
export class CaptureService implements TrackCapture {
  constructor(private readonly deps: CaptureServiceDeps) {}

  listening(listener: { host: string; port: number; encoding: string }): void {
    this.deps.state.listening(listener);
  }

  stoppedListening(): void {
    this.deps.state.stoppedListening();
  }

  connectionOpened(id: number): void {
    this.deps.state.connectionOpened(id, this.deps.clock.now());
  }

  voiceIdentified(id: number, voice: string): void {
    this.deps.state.voiceIdentified(id, voice);
  }

  connectionClosed(id: number): void {
    this.deps.state.connectionClosed(id);
  }
}
