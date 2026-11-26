import type { AppWindow, WindowSystem } from '../../../application/ports/out/window-system.js';
import type { Availability } from '../../../domain/availability.js';
import { AppError } from '../../../domain/errors.js';

/**
 * The window system where windows can't be managed (not Windows, or `koffi` could not be loaded):
 * every call fails with `INPUT_DISABLED`, so the rest of the bridge keeps working.
 */
export class DisabledWindowSystem implements WindowSystem {
  readonly availability: Availability;

  constructor(private readonly reason: string) {
    this.availability = { available: false, reason };
  }

  processTree(_rootPid: number): Promise<Set<number>> {
    return this.fail();
  }

  topLevelWindows(): Promise<AppWindow[]> {
    return this.fail();
  }

  bringToFront(_window: AppWindow): Promise<boolean> {
    return this.fail();
  }

  private fail(): Promise<never> {
    return Promise.reject(
      new AppError('INPUT_DISABLED', `Windows can't be brought to the front: ${this.reason}`),
    );
  }
}
