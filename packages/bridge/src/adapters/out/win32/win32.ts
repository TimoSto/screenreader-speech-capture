/** A window handle (`HWND`) as a number. */
export type Hwnd = number;

/**
 * The Win32 calls the window system needs, as plain functions (`win32-bindings.ts` binds them
 * with koffi). Kept this small so the logic on top (`Win32WindowSystem`) can be tested with a fake.
 */
export interface Win32 {
  /** Every process with its parent (`CreateToolhelp32Snapshot`). */
  processes(): { pid: number; parentPid: number }[];
  /** The top-level windows, front to back (`EnumWindows`). */
  topLevelWindows(): Hwnd[];
  /** The process and the thread that own the window (`GetWindowThreadProcessId`). */
  owner(hwnd: Hwnd): { pid: number; thread: number };
  isVisible(hwnd: Hwnd): boolean;
  /** `GetWindow(GW_OWNER)`: 0 for a window that no other window owns. */
  ownerWindow(hwnd: Hwnd): Hwnd;
  title(hwnd: Hwnd): string;
  className(hwnd: Hwnd): string;
  isMinimized(hwnd: Hwnd): boolean;
  /** `ShowWindow(SW_RESTORE)`. */
  restore(hwnd: Hwnd): void;
  /** Presses and releases Alt (`keybd_event`). */
  tapAlt(): void;
  setForeground(hwnd: Hwnd): boolean;
  bringToTop(hwnd: Hwnd): void;
  foreground(): Hwnd;
  currentThread(): number;
  attachInput(thread: number, toThread: number, attach: boolean): boolean;
}
