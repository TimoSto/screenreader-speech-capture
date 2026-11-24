import type { Availability } from '../../../domain/availability.js';
import type { KeyName } from '../../../domain/key-chord.js';
import type { MouseButton } from '../in/send-native-input.js';

/**
 * Driven port for native input: the primitives a chord is built from. Rejects with an
 * `INPUT_DISABLED` `AppError` when the machine can't inject input.
 */
export interface InputInjector {
  /** Whether input can be injected here (`GET /status`, `input.native`). */
  readonly availability: Availability;
  click(x: number, y: number, button: MouseButton): Promise<void>;
  keyDown(key: KeyName): Promise<void>;
  keyUp(key: KeyName): Promise<void>;
  keyTap(key: KeyName): Promise<void>;
}
