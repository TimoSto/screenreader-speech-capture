import type { Availability } from '../../../domain/availability.js';

/** A visible top-level window (no owner window), as the window system reports it. */
export interface AppWindow {
  /** Opaque to the application: only handed back to `bringToFront`. */
  readonly handle: unknown;
  /** The process that owns it. */
  readonly pid: number;
  readonly title: string;
  readonly className: string;
}

/**
 * The machine's processes and windows, for bringing a browser window the bridge started to the
 * front (docs/usage/native-input.md#bringing-the-browser-to-the-front). Only facts, no rules:
 * which window to pick is the application's. Rejects with an `INPUT_DISABLED` `AppError` where it
 * can't work (not Windows, `koffi` not loaded).
 */
export interface WindowSystem {
  /** Whether windows can be brought to the front here (`GET /status`, `input.focus`). */
  readonly availability: Availability;
  /** `rootPid` and every process below it. */
  processTree(rootPid: number): Promise<Set<number>>;
  /** The visible top-level windows without an owner window, front to back. */
  topLevelWindows(): Promise<AppWindow[]>;
  /** Makes the window the foreground window; `true` if it is the foreground window afterwards. */
  bringToFront(window: AppWindow): Promise<boolean>;
}
