import type { MouseButton } from '../../../application/ports/in/send-native-input.js';
import type { InputInjector } from '../../../application/ports/out/input-injector.js';
import { AppError } from '../../../domain/errors.js';

/**
 * The injector when native input can't be loaded (docs/usage/native-input.md#when-input-is-not-available):
 * every call fails with `INPUT_DISABLED`, so the rest of the bridge keeps working.
 */
export class DisabledInputInjector implements InputInjector {
  constructor(private readonly reason: string) {}

  click(_x: number, _y: number, _button: MouseButton): Promise<void> {
    return this.fail();
  }

  keyDown(): Promise<void> {
    return this.fail();
  }

  keyUp(): Promise<void> {
    return this.fail();
  }

  keyTap(): Promise<void> {
    return this.fail();
  }

  private fail(): Promise<never> {
    return Promise.reject(
      new AppError('INPUT_DISABLED', `Native input is not available: ${this.reason}`),
    );
  }
}
