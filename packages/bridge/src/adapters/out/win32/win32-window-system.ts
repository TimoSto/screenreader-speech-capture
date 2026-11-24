import type { AppWindow, WindowSystem } from '../../../application/ports/out/window-system.js';
import type { Hwnd, Win32 } from './win32.js';

/**
 * {@link WindowSystem} on Win32 (docs/usage/native-input.md#bringing-the-browser-to-the-front).
 * Windows lets a background process take the foreground only in some cases, so `bringToFront`
 * first taps Alt (the bridge is then the process that sent the last input, which Windows
 * allows), and if that wasn't enough, tries once more attached to the foreground window's input
 * thread.
 */
export class Win32WindowSystem implements WindowSystem {
  constructor(private readonly win32: Win32) {}

  processTree(rootPid: number): Promise<Set<number>> {
    const children = new Map<number, number[]>();
    for (const { pid, parentPid } of this.win32.processes()) {
      // The System Idle Process is its own parent.
      if (pid === parentPid) continue;
      const siblings = children.get(parentPid) ?? [];
      siblings.push(pid);
      children.set(parentPid, siblings);
    }
    const tree = new Set<number>([rootPid]);
    const open = [rootPid];
    for (let pid = open.pop(); pid !== undefined; pid = open.pop()) {
      for (const child of children.get(pid) ?? []) {
        if (tree.has(child)) continue;
        tree.add(child);
        open.push(child);
      }
    }
    return Promise.resolve(tree);
  }

  topLevelWindows(): Promise<AppWindow[]> {
    const { win32 } = this;
    const windows: AppWindow[] = [];
    for (const hwnd of win32.topLevelWindows()) {
      if (!win32.isVisible(hwnd) || win32.ownerWindow(hwnd) !== 0) continue;
      windows.push({
        handle: hwnd,
        pid: win32.owner(hwnd).pid,
        title: win32.title(hwnd),
        className: win32.className(hwnd),
      });
    }
    return Promise.resolve(windows);
  }

  bringToFront(window: AppWindow): Promise<boolean> {
    const { win32 } = this;
    const hwnd = window.handle as Hwnd;
    if (win32.isMinimized(hwnd)) win32.restore(hwnd);
    win32.tapAlt();
    win32.setForeground(hwnd);
    win32.bringToTop(hwnd);
    if (win32.foreground() !== hwnd) this.attachedToForeground(hwnd);
    return Promise.resolve(win32.foreground() === hwnd);
  }

  /** Brings `hwnd` forward while attached to the input thread of the current foreground window. */
  private attachedToForeground(hwnd: Hwnd): void {
    const { win32 } = this;
    const current = win32.foreground();
    const own = win32.currentThread();
    const theirs = current === 0 ? 0 : win32.owner(current).thread;
    const attached = theirs !== 0 && theirs !== own && win32.attachInput(own, theirs, true);
    try {
      win32.setForeground(hwnd);
      win32.bringToTop(hwnd);
    } finally {
      if (attached) win32.attachInput(own, theirs, false);
    }
  }
}
