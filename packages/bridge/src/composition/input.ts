import { DisabledInputInjector } from '../adapters/out/input/disabled-input-injector.js';
import {
  type RobotApi,
  RobotjsInputInjector,
} from '../adapters/out/robotjs/robotjs-input-injector.js';
import type { InputInjector } from '../application/ports/out/input-injector.js';
import type { Logger } from '../application/ports/out/logger.js';

/**
 * Loads `@jitsi/robotjs`, an optional dependency. When it can't be loaded (no prebuilt binary for
 * this platform, not installed), the bridge keeps running with an injector that answers
 * `INPUT_DISABLED` (docs/usage/native-input.md#when-input-is-not-available).
 */
export async function createInputInjector(logger: Logger): Promise<InputInjector> {
  try {
    const module = (await import('@jitsi/robotjs')) as unknown as {
      default?: RobotApi;
    } & RobotApi;
    const robot = module.default ?? module;
    logger.debug('native input is available (robotjs)');
    return new RobotjsInputInjector(robot);
  } catch (error) {
    const reason = `@jitsi/robotjs could not be loaded (${error instanceof Error ? error.message : String(error)})`;
    logger.warn(`native input is off: ${reason}`);
    return new DisabledInputInjector(reason);
  }
}
