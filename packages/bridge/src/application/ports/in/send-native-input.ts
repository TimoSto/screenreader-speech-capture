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

/**
 * Native mouse and keyboard input on the machine the bridge runs on
 * (docs/usage/native-input.md). Requests run one after the other.
 */
export interface SendNativeInput {
  click(request: ClickRequest): Promise<void>;
  pressKeys(request: PressKeysRequest): Promise<void>;
}
