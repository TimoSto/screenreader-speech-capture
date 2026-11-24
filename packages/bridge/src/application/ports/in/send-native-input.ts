export type MouseButton = 'left' | 'right' | 'middle';

export interface ClickRequest {
  /** Screen position in physical pixels. */
  x: number;
  y: number;
  /** Default `left`. */
  button?: MouseButton | undefined;
}

export interface PressKeysRequest {
  /** One chord (`Insert+T`) or a sequence of chords. */
  keys: string | readonly string[];
  /** Pause between the chords of a sequence in milliseconds. */
  delayMs?: number | undefined;
}

export interface InputHooks {
  /**
   * Runs in the input queue right before the input is sent, after the request was checked: no
   * other input runs between it and the input. If it rejects, nothing is sent.
   */
  beforeInject?: (() => Promise<void> | void) | undefined;
}

/**
 * Native mouse and keyboard input on the machine the bridge runs on
 * (docs/usage/native-input.md). Requests run one after the other.
 */
export interface SendNativeInput {
  click(request: ClickRequest, hooks?: InputHooks): Promise<void>;
  pressKeys(request: PressKeysRequest, hooks?: InputHooks): Promise<void>;
}
