import {
  clickPoint,
  FocusError,
  parseWindowGeometry,
  READ_GEOMETRY_SCRIPT,
  type ScreenPoint,
} from '../../domain/native-input.js';
import type {
  ClickOptions,
  FocusablePage,
  NativeInput,
  PressKeysOptions,
  SetFocusOptions,
} from '../ports/in/native-input.js';
import type { BridgeApi } from '../ports/out/bridge-api.js';
import { VersionGate } from './version-gate.js';

interface NativeInputServiceDeps {
  api: Pick<BridgeApi, 'status' | 'click' | 'pressKeys'>;
  /** The HTTP API version this client was built for (`API_VERSION` from the shared contract). */
  apiVersion: string;
}

/** {@link NativeInput} on the bridge's native input endpoints (docs/usage/native-input.md). */
export class NativeInputService implements NativeInput {
  readonly #gate: VersionGate;

  constructor(private readonly deps: NativeInputServiceDeps) {
    this.#gate = new VersionGate(deps.api, deps.apiVersion);
  }

  async click(point: ScreenPoint, options: ClickOptions = {}): Promise<void> {
    await this.#gate.ensure();
    await this.deps.api.click({ x: point.x, y: point.y, button: options.button });
  }

  async pressKeys(keys: string | readonly string[], options: PressKeysOptions = {}): Promise<void> {
    await this.#gate.ensure();
    await this.deps.api.pressKeys({ keys, delayMs: options.delayMs });
  }

  async setFocus(page: FocusablePage, options: SetFocusOptions = {}): Promise<void> {
    const geometry = parseWindowGeometry(await page.evaluate(READ_GEOMETRY_SCRIPT));
    const box = options.target === undefined ? undefined : await options.target.boundingBox();
    if (box === null) {
      throw new FocusError('The target element has no bounding box: is it visible?');
    }
    await this.click(clickPoint(geometry, box));
  }
}
