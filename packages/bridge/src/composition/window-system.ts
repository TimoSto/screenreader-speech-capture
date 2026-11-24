import { DisabledWindowSystem } from '../adapters/out/input/disabled-window-system.js';
import { bindWin32, type KoffiApi } from '../adapters/out/win32/win32-bindings.js';
import { Win32WindowSystem } from '../adapters/out/win32/win32-window-system.js';
import type { Logger } from '../application/ports/out/logger.js';
import type { WindowSystem } from '../application/ports/out/window-system.js';

/**
 * Loads `koffi`, an optional dependency, and binds the Win32 calls that bring a window to the
 * front. Not on Windows, or when it can't be loaded, the bridge keeps running with a window
 * system that answers `INPUT_DISABLED` (docs/usage/native-input.md#bringing-the-browser-to-the-front).
 */
export async function createWindowSystem(logger: Logger): Promise<WindowSystem> {
  if (process.platform !== 'win32') {
    logger.debug('bringing windows to the front is off: only on Windows');
    return new DisabledWindowSystem('only on Windows');
  }
  try {
    const module = (await import('koffi')) as unknown as { default?: KoffiApi } & KoffiApi;
    const windows = new Win32WindowSystem(bindWin32(module.default ?? module));
    logger.debug('bringing windows to the front is available (koffi)');
    return windows;
  } catch (error) {
    const reason = `koffi could not be loaded (${error instanceof Error ? error.message : String(error)})`;
    logger.warn(`bringing windows to the front is off: ${reason}`);
    return new DisabledWindowSystem(reason);
  }
}
