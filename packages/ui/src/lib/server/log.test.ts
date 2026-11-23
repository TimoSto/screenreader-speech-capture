import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverLog } from './log';

const KEY = Symbol.for('screenreader-speech-capture.ui-logger');
const global = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete global[KEY];
  vi.restoreAllMocks();
});

describe('serverLog', () => {
  it('writes to the logger the bridge put on globalThis', () => {
    const error = vi.fn();
    global[KEY] = { error, warn: vi.fn() };
    serverLog().error('broken');
    expect(error).toHaveBeenCalledWith('broken');
  });

  it('falls back to the console without a bridge (pnpm dev:ui)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global[KEY] = { not: 'a logger' };
    serverLog().error('broken');
    expect(error).toHaveBeenCalledWith('[web-ui] broken');
  });
});
