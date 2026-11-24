import { describe, expect, it } from 'vitest';
import type { Hwnd, Win32 } from './win32.js';
import { Win32WindowSystem } from './win32-window-system.js';

interface FakeWindow {
  hwnd: Hwnd;
  pid: number;
  thread: number;
  title: string;
  visible?: boolean;
  owner?: Hwnd;
  minimized?: boolean;
}

/** A desktop of windows (front to back) and processes; records the calls that change things. */
function fakeWin32(windows: FakeWindow[], processes: { pid: number; parentPid: number }[]) {
  const calls: string[] = [];
  let foreground: Hwnd = 0;
  /** `setForeground` only works while attached to the foreground thread, or not at all. */
  const rules = { needsAttach: false, never: false };
  let attached = false;
  const byHwnd = (hwnd: Hwnd) => windows.find((w) => w.hwnd === hwnd)!;
  const win32: Win32 = {
    processes: () => processes,
    topLevelWindows: () => windows.map((w) => w.hwnd),
    owner: (hwnd) => ({ pid: byHwnd(hwnd).pid, thread: byHwnd(hwnd).thread }),
    isVisible: (hwnd) => byHwnd(hwnd).visible ?? true,
    ownerWindow: (hwnd) => byHwnd(hwnd).owner ?? 0,
    title: (hwnd) => byHwnd(hwnd).title,
    className: () => 'Chrome_WidgetWin_1',
    isMinimized: (hwnd) => byHwnd(hwnd).minimized ?? false,
    restore: (hwnd) => void calls.push(`restore ${hwnd}`),
    tapAlt: () => void calls.push('alt'),
    setForeground: (hwnd) => {
      calls.push(`setForeground ${hwnd}`);
      if (rules.never || (rules.needsAttach && !attached)) return false;
      foreground = hwnd;
      return true;
    },
    bringToTop: (hwnd) => void calls.push(`bringToTop ${hwnd}`),
    foreground: () => foreground,
    currentThread: () => 1,
    attachInput: (thread, toThread, attach) => {
      calls.push(`attach ${thread}->${toThread} ${attach}`);
      attached = attach;
      return true;
    },
  };
  return {
    win32,
    calls,
    rules,
    setForegroundWindow: (hwnd: Hwnd) => (foreground = hwnd),
  };
}

describe('Win32WindowSystem', () => {
  it('collects a process tree from the parent ids', async () => {
    const { win32 } = fakeWin32(
      [],
      [
        { pid: 0, parentPid: 0 },
        { pid: 10, parentPid: 1 },
        { pid: 11, parentPid: 10 },
        { pid: 12, parentPid: 11 },
        { pid: 20, parentPid: 1 },
      ],
    );
    expect([...(await new Win32WindowSystem(win32).processTree(10))].sort()).toEqual([10, 11, 12]);
  });

  it('lists visible windows that no other window owns, front to back', async () => {
    const { win32 } = fakeWin32(
      [
        { hwnd: 1, pid: 10, thread: 5, title: 'Page - Chromium' },
        { hwnd: 2, pid: 10, thread: 5, title: 'hidden', visible: false },
        { hwnd: 3, pid: 10, thread: 5, title: 'popup', owner: 1 },
        { hwnd: 4, pid: 20, thread: 6, title: 'Editor' },
      ],
      [],
    );
    const windows = await new Win32WindowSystem(win32).topLevelWindows();
    expect(windows.map((w) => [w.handle, w.pid, w.title])).toEqual([
      [1, 10, 'Page - Chromium'],
      [4, 20, 'Editor'],
    ]);
  });

  it('restores a minimised window and taps Alt before bringing it to the front', async () => {
    const page = { hwnd: 1, pid: 10, thread: 5, title: 'Page', minimized: true };
    const { win32, calls } = fakeWin32([page], []);
    const system = new Win32WindowSystem(win32);
    const [window] = await system.topLevelWindows();
    await expect(system.bringToFront(window!)).resolves.toBe(true);
    expect(calls).toEqual(['restore 1', 'alt', 'setForeground 1', 'bringToTop 1']);
  });

  it("tries again attached to the foreground window's input thread", async () => {
    const page = { hwnd: 1, pid: 10, thread: 5, title: 'Page' };
    const editor = { hwnd: 2, pid: 20, thread: 6, title: 'Editor' };
    const { win32, calls, rules, setForegroundWindow } = fakeWin32([page, editor], []);
    setForegroundWindow(2);
    rules.needsAttach = true;
    const system = new Win32WindowSystem(win32);
    const [window] = await system.topLevelWindows();
    await expect(system.bringToFront(window!)).resolves.toBe(true);
    expect(calls.slice(3)).toEqual([
      'attach 1->6 true',
      'setForeground 1',
      'bringToTop 1',
      'attach 1->6 false',
    ]);
  });

  it('reports false when the window still is not in front', async () => {
    const { win32, rules } = fakeWin32([{ hwnd: 1, pid: 10, thread: 5, title: 'Page' }], []);
    rules.never = true;
    const system = new Win32WindowSystem(win32);
    const [window] = await system.topLevelWindows();
    await expect(system.bringToFront(window!)).resolves.toBe(false);
  });
});
