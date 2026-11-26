import type * as Koffi from 'koffi';
import type { Hwnd, Win32 } from './win32.js';

/** The part of `koffi` the bindings use. */
export type KoffiApi = Pick<
  typeof Koffi,
  'load' | 'proto' | 'struct' | 'array' | 'sizeof' | 'offsetof'
>;

const TH32CS_SNAPPROCESS = 0x2;
const INVALID_HANDLE_VALUE = -1;
const GW_OWNER = 4;
const SW_RESTORE = 9;
const VK_MENU = 0x12;
const KEYEVENTF_KEYUP = 0x2;
/** Characters read of a window title or class name. */
const TEXT_LENGTH = 512;

/**
 * Binds the {@link Win32} calls with koffi (Windows only). Handles are `intptr_t` numbers, so they
 * can be compared and handed back as they are. Only the native calls live here: the logic is in
 * `Win32WindowSystem`, which the unit tests cover with a fake. Verified by hand on the Windows VM.
 */
export function bindWin32(koffi: KoffiApi): Win32 {
  const kernel32 = koffi.load('kernel32.dll');
  const user32 = koffi.load('user32.dll');

  // PROCESSENTRY32W, read from a buffer at the offsets koffi computes for this architecture.
  const ProcessEntry = koffi.struct('PROCESSENTRY32W', {
    dwSize: 'uint32_t',
    cntUsage: 'uint32_t',
    th32ProcessID: 'uint32_t',
    th32DefaultHeapID: 'uintptr_t',
    th32ModuleID: 'uint32_t',
    cntThreads: 'uint32_t',
    th32ParentProcessID: 'uint32_t',
    pcPriClassBase: 'int32_t',
    dwFlags: 'uint32_t',
    szExeFile: koffi.array('uint16_t', 260),
  });
  const entrySize = koffi.sizeof(ProcessEntry);
  const pidAt = koffi.offsetof(ProcessEntry, 'th32ProcessID');
  const parentAt = koffi.offsetof(ProcessEntry, 'th32ParentProcessID');

  const CreateToolhelp32Snapshot = kernel32.func(
    'intptr_t __stdcall CreateToolhelp32Snapshot(uint32_t dwFlags, uint32_t th32ProcessID)',
  );
  const Process32FirstW = kernel32.func(
    'int __stdcall Process32FirstW(intptr_t hSnapshot, _Inout_ void *lppe)',
  );
  const Process32NextW = kernel32.func(
    'int __stdcall Process32NextW(intptr_t hSnapshot, _Inout_ void *lppe)',
  );
  const CloseHandle = kernel32.func('int __stdcall CloseHandle(intptr_t hObject)');
  const GetCurrentThreadId = kernel32.func('uint32_t __stdcall GetCurrentThreadId()');

  // The callback type EnumWindows' prototype names.
  koffi.proto('int __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');
  const EnumWindows = user32.func(
    'int __stdcall EnumWindows(EnumWindowsProc *lpEnumFunc, intptr_t lParam)',
  );
  const GetWindowThreadProcessId = user32.func(
    'uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *lpdwProcessId)',
  );
  const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(intptr_t hWnd)');
  const GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)');
  const GetWindowTextW = user32.func(
    'int __stdcall GetWindowTextW(intptr_t hWnd, _Out_ void *lpString, int nMaxCount)',
  );
  const GetClassNameW = user32.func(
    'int __stdcall GetClassNameW(intptr_t hWnd, _Out_ void *lpClassName, int nMaxCount)',
  );
  const IsIconic = user32.func('int __stdcall IsIconic(intptr_t hWnd)');
  const ShowWindow = user32.func('int __stdcall ShowWindow(intptr_t hWnd, int nCmdShow)');
  const keybd_event = user32.func(
    'void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)',
  );
  const SetForegroundWindow = user32.func('int __stdcall SetForegroundWindow(intptr_t hWnd)');
  const BringWindowToTop = user32.func('int __stdcall BringWindowToTop(intptr_t hWnd)');
  const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
  const AttachThreadInput = user32.func(
    'int __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, int fAttach)',
  );

  const text = (read: (hwnd: Hwnd, buffer: Buffer, max: number) => unknown, hwnd: Hwnd) => {
    const buffer = Buffer.alloc(TEXT_LENGTH * 2);
    const length = Number(read(hwnd, buffer, TEXT_LENGTH));
    return buffer.toString('utf16le', 0, Math.max(0, length) * 2);
  };

  return {
    processes() {
      const snapshot = Number(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
      if (snapshot === INVALID_HANDLE_VALUE) throw new Error('CreateToolhelp32Snapshot failed');
      try {
        const entry = Buffer.alloc(entrySize);
        entry.writeUInt32LE(entrySize, 0);
        const list: { pid: number; parentPid: number }[] = [];
        for (
          let more = Process32FirstW(snapshot, entry) !== 0;
          more;
          more = Process32NextW(snapshot, entry) !== 0
        ) {
          list.push({ pid: entry.readUInt32LE(pidAt), parentPid: entry.readUInt32LE(parentAt) });
        }
        return list;
      } finally {
        CloseHandle(snapshot);
      }
    },
    topLevelWindows() {
      const list: Hwnd[] = [];
      // A transient callback: EnumWindows calls it before it returns.
      EnumWindows((hwnd: number) => {
        list.push(Number(hwnd));
        return 1;
      }, 0);
      return list;
    },
    owner(hwnd) {
      const pid = [0];
      const thread = Number(GetWindowThreadProcessId(hwnd, pid));
      return { pid: pid[0]!, thread };
    },
    isVisible: (hwnd) => IsWindowVisible(hwnd) !== 0,
    ownerWindow: (hwnd) => Number(GetWindow(hwnd, GW_OWNER)),
    title: (hwnd) => text(GetWindowTextW, hwnd),
    className: (hwnd) => text(GetClassNameW, hwnd),
    isMinimized: (hwnd) => IsIconic(hwnd) !== 0,
    restore: (hwnd) => void ShowWindow(hwnd, SW_RESTORE),
    tapAlt() {
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    },
    setForeground: (hwnd) => SetForegroundWindow(hwnd) !== 0,
    bringToTop: (hwnd) => void BringWindowToTop(hwnd),
    foreground: () => Number(GetForegroundWindow()),
    currentThread: () => Number(GetCurrentThreadId()),
    attachInput: (thread, toThread, attach) =>
      AttachThreadInput(thread, toThread, attach ? 1 : 0) !== 0,
  };
}
