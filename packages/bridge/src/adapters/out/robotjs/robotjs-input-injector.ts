import type { MouseButton } from '../../../application/ports/in/send-native-input.js';
import type { InputInjector } from '../../../application/ports/out/input-injector.js';
import type { KeyName } from '../../../domain/key-chord.js';

/** The part of `@jitsi/robotjs` the injector uses. */
export interface RobotApi {
  moveMouse(x: number, y: number): void;
  mouseClick(button?: string, double?: boolean): void;
  keyToggle(key: string, down: string): void;
  keyTap(key: string): void;
}

/** Domain key names that robotjs spells differently. */
const ROBOT_KEYS: Readonly<Record<string, string>> = { win: 'command' };

const robotKey = (key: KeyName) => ROBOT_KEYS[key] ?? key;

/**
 * Driven adapter on `@jitsi/robotjs`: native mouse and keyboard input on Windows
 * (docs/implementation/architecture.md#native-input-in-the-bridge). Only tested on Windows, the
 * unit tests use a fake `RobotApi`.
 */
export class RobotjsInputInjector implements InputInjector {
  constructor(private readonly robot: RobotApi) {}

  click(x: number, y: number, button: MouseButton): Promise<void> {
    return this.run(() => {
      this.robot.moveMouse(x, y);
      this.robot.mouseClick(button);
    });
  }

  keyDown(key: KeyName): Promise<void> {
    return this.run(() => this.robot.keyToggle(robotKey(key), 'down'));
  }

  keyUp(key: KeyName): Promise<void> {
    return this.run(() => this.robot.keyToggle(robotKey(key), 'up'));
  }

  keyTap(key: KeyName): Promise<void> {
    return this.run(() => this.robot.keyTap(robotKey(key)));
  }

  private run(action: () => void): Promise<void> {
    try {
      action();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
