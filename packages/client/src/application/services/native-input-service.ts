import { API_LIMITS } from '@screenreader-speech-capture/shared';
import {
  clickPoint,
  focusMarker,
  type FocusedWindow,
  FocusError,
  parseWindowGeometry,
  READ_GEOMETRY_SCRIPT,
  type ScreenPoint,
} from '../../domain/native-input.js';
import { BridgeHttpError, SpeechTimeoutError } from '../../domain/errors.js';
import type {
  ClickOptions,
  FocusablePage,
  InputRecording,
  InputRecordOptions,
  NativeInput,
  PressKeysOptions,
  SetFocusOptions,
} from '../ports/in/native-input.js';
import type { BridgeApi, CaptureRequest, InputCapture } from '../ports/out/bridge-api.js';
import { silenceFailure } from './silence.js';
import { VersionGate } from './version-gate.js';

interface NativeInputServiceDeps {
  api: Pick<
    BridgeApi,
    'status' | 'click' | 'pressKeys' | 'captureClick' | 'captureKeys' | 'focusWindow'
  >;
  /** The HTTP API version this client was built for (`API_VERSION` from the shared contract). */
  apiVersion: string;
  /** The unique part of a title marker. Default: random. */
  random?: (() => string) | undefined;
}

/** Codes that mean "the bridge can't bring this window forward": the click is the fallback. */
const CANNOT_FOCUS = new Set(['NOT_FOUND', 'INPUT_DISABLED']);

const randomPart = () => Math.random().toString(36).slice(2, 10);

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

  async recordClick(
    point: ScreenPoint,
    options: ClickOptions & InputRecordOptions = {},
  ): Promise<InputRecording> {
    await this.#gate.ensure();
    const capture = await this.deps.api.captureClick({
      x: point.x,
      y: point.y,
      button: options.button,
      capture: captureRequest(options),
    });
    return recording(capture, options);
  }

  async recordKeys(
    keys: string | readonly string[],
    options: PressKeysOptions & InputRecordOptions = {},
  ): Promise<InputRecording> {
    await this.#gate.ensure();
    const capture = await this.deps.api.captureKeys({
      keys,
      delayMs: options.delayMs,
      capture: captureRequest(options),
    });
    return recording(capture, options);
  }

  async focusMcpBrowser(): Promise<FocusedWindow> {
    await this.#gate.ensure();
    return this.deps.api.focusWindow({ target: 'mcp' });
  }

  async bringToFront(page: FocusablePage): Promise<FocusedWindow | null> {
    await this.#gate.ensure();
    const marker = focusMarker((this.deps.random ?? randomPart)());
    const original: unknown = await page.evaluate('document.title');
    await page.evaluate(`document.title = ${JSON.stringify(marker)}`);
    try {
      return await this.deps.api.focusWindow({ target: 'playwright', title: marker });
    } catch (error) {
      if (error instanceof BridgeHttpError && CANNOT_FOCUS.has(error.code)) return null;
      throw error;
    } finally {
      await page.evaluate(
        `document.title = ${JSON.stringify(typeof original === 'string' ? original : '')}`,
      );
    }
  }

  async setFocus(page: FocusablePage, options: SetFocusOptions = {}): Promise<void> {
    if (options.target === undefined && (await this.bringToFront(page))) return;
    const geometry = parseWindowGeometry(await page.evaluate(READ_GEOMETRY_SCRIPT));
    const box = options.target === undefined ? undefined : await options.target.boundingBox();
    if (box === null) {
      throw new FocusError('The target element has no bounding box: is it visible?');
    }
    await this.click(clickPoint(geometry, box));
  }
}

function captureRequest(options: InputRecordOptions): CaptureRequest {
  return {
    quietForMs: options.quietFor,
    firstWithinMs: options.firstWithin,
    timeoutMs: options.timeout,
    settleMs: options.settle,
  };
}

/** The bridge's answer as a recording; `timeout` is a `SpeechTimeoutError`, as for `record()`. */
function recording(capture: InputCapture, options: InputRecordOptions): InputRecording {
  const truncated = capture.truncated || capture.omitted > 0;
  if (capture.status === 'timeout') {
    throw new SpeechTimeoutError(
      silenceFailure(
        options.quietFor ?? API_LIMITS.capture.quietForMs.default,
        options.timeout ?? API_LIMITS.capture.timeoutMs.default,
      ),
      capture.entries,
      truncated,
    );
  }
  return { entries: capture.entries, truncated, startSeq: capture.startSeq };
}
