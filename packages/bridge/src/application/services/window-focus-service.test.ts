import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWindowSystem, MemoryLogger, RecordingInputInjector } from '../../../test/fakes.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { NativeInputService } from './native-input-service.js';
import { TITLE_WAIT, WindowFocusService } from './window-focus-service.js';

const MCP = 100;
const SERVER = 200;

function setup(pids: { mcp?: number | null; playwright?: number | null } = {}) {
  const windows = new FakeWindowSystem();
  // MCP → its Chrome (101) → a Chrome child (102); the Playwright server → two browsers.
  windows.parents = new Map([
    [101, MCP],
    [102, 101],
    [201, SERVER],
    [202, SERVER],
  ]);
  const clock = new SystemClock();
  const logger = new MemoryLogger();
  const injector = new RecordingInputInjector();
  const input = new NativeInputService({ injector, clock, logger });
  const service = new WindowFocusService({
    windows,
    queue: input,
    services: {
      mcp: { pid: () => (pids.mcp === undefined ? MCP : pids.mcp) },
      playwright: { pid: () => (pids.playwright === undefined ? SERVER : pids.playwright) },
    },
    clock,
    logger,
  });
  return { windows, service, input, injector, logger };
}

/** The settled value of a promise, without letting a rejection go unhandled. */
function settle<T>(promise: Promise<T>) {
  const result: { value?: T; error?: unknown; done: boolean } = { done: false };
  promise.then(
    (value) => Object.assign(result, { value, done: true }),
    (error: unknown) => Object.assign(result, { error, done: true }),
  );
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WindowFocusService', () => {
  it("brings the front-most window of the target's tree to the front", async () => {
    const { windows, service, logger } = setup();
    windows.addWindow(999, 'Editor');
    windows.addWindow(201, 'Test page - Chromium');
    const mcp = windows.addWindow(101, 'Checkout - Chromium');
    windows.addWindow(102, 'Older MCP window - Chromium');
    await expect(service.focus({ target: 'mcp' })).resolves.toEqual({
      title: 'Checkout - Chromium',
      pid: 101,
    });
    expect(windows.focused).toEqual([mcp]);
    expect(logger.lines).toContain('info focus mcp: "Checkout - Chromium" (pid 101)');
  });

  it('ignores windows without a title', async () => {
    const { windows, service } = setup();
    windows.addWindow(101, '');
    windows.addWindow(102, 'Page - Chromium');
    await expect(service.focus({ target: 'mcp' })).resolves.toMatchObject({ pid: 102 });
  });

  it("picks the window with the title marker among the server's browsers", async () => {
    const { windows, service } = setup();
    windows.addWindow(201, 'Other test - Chromium');
    windows.addWindow(202, 'sr-focus-abc - Chromium');
    await expect(service.focus({ target: 'playwright', title: 'sr-focus-abc' })).resolves.toEqual({
      title: 'sr-focus-abc - Chromium',
      pid: 202,
    });
  });

  it('waits for a title the browser sets late', async () => {
    const { windows, service } = setup();
    const window = windows.addWindow(201, 'Loading - Chromium');
    const result = settle(service.focus({ target: 'playwright', title: 'sr-focus-x' }));
    await vi.advanceTimersByTimeAsync(300);
    expect(result.done).toBe(false);
    windows.windows = [{ ...window, title: 'sr-focus-x - Chromium' }];
    await vi.advanceTimersByTimeAsync(TITLE_WAIT.pollMs);
    expect(result.value).toEqual({ title: 'sr-focus-x - Chromium', pid: 201 });
  });

  it('answers NOT_FOUND when the marker never shows up', async () => {
    const { windows, service } = setup();
    windows.addWindow(999, 'sr-focus-x - Chromium'); // not the server's
    const result = settle(service.focus({ target: 'playwright', title: 'sr-focus-x' }));
    await vi.advanceTimersByTimeAsync(TITLE_WAIT.timeoutMs);
    expect(result.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(windows.focused).toEqual([]);
  });

  it('answers NOT_FOUND when the service is not running or has no window', async () => {
    await expect(setup({ mcp: null }).service.focus({ target: 'mcp' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Playwright MCP is not running',
    });
    await expect(setup().service.focus({ target: 'mcp' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('no browser window yet') as string,
    });
  });

  it('answers FOCUS_FAILED when Windows refuses', async () => {
    const { windows, service } = setup();
    windows.addWindow(101, 'Page - Chromium');
    windows.refuse = true;
    await expect(service.focus({ target: 'mcp' })).rejects.toMatchObject({
      code: 'FOCUS_FAILED',
    });
  });

  it('checks the request', async () => {
    const { service } = setup();
    await expect(service.focus({ target: 'nope' as never })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      details: { field: 'target' },
    });
    await expect(service.focus({ target: 'mcp', title: '' })).rejects.toMatchObject({
      details: { field: 'title' },
    });
  });

  it('runs in the input queue, after input already queued', async () => {
    const { windows, service, input, injector } = setup();
    windows.addWindow(101, 'Page - Chromium');
    const order: string[] = [];
    const tap = injector.keyTap.bind(injector);
    injector.keyTap = async (key) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`key ${key}`);
      return tap(key);
    };
    const keys = input.pressKeys({ keys: 'h' });
    const focused = service.focus({ target: 'mcp' }).then(() => order.push('focus'));
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([keys, focused]);
    expect(order).toEqual(['key h', 'focus']);
  });
});
