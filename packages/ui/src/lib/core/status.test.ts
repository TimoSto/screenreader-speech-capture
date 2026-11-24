import type { StatusDto } from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import { announcement, deriveChips } from './status.js';

function status(patch: Partial<StatusDto> = {}): StatusDto {
  return {
    bridge: {
      version: '0.3.0',
      apiVersion: '1.13',
      state: 'ready',
      startedAt: '2026-01-01T00:00:00.000Z',
    },
    tcp: {
      listening: true,
      host: '127.0.0.1',
      port: 4449,
      encoding: 'windows-1252',
      connections: [{ id: 1, voice: null, connectedAt: '2026-01-01T00:00:00.000Z' }],
    },
    buffer: { size: 0, maxEntries: 10000, firstSeq: null, lastSeq: null },
    playwright: { state: 'running', version: '1.65.0', port: 3000, restarts: 0, exitCode: null },
    mcp: { state: 'running', version: '0.0.85', port: 8931, restarts: 0, exitCode: null },
    session: { current: null, count: 0 },
    input: {
      native: { available: true, backend: 'robotjs', reason: null },
      focus: { available: true, backend: 'koffi', reason: null },
    },
    ...patch,
  };
}

const byId = (s: StatusDto | null, reachable = true) =>
  Object.fromEntries(deriveChips(s, reachable).map((chip) => [chip.id, chip]));

describe('deriveChips', () => {
  it('shows service versions, and crashed or failed as a warning', () => {
    const s = status();
    expect(byId(s).playwright).toMatchObject({ text: 'Playwright 1.65.0', tone: 'ok' });
    s.mcp.state = 'crashed';
    expect(byId(s).mcp).toMatchObject({ text: 'MCP 0.0.85 · crashed', tone: 'warning' });
    s.mcp.state = 'failed';
    expect(byId(s).mcp?.text).toBe('MCP 0.0.85 · failed');
  });

  it('keeps a starting service neutral, with a red (down) dot', () => {
    const s = status();
    s.playwright.state = 'starting';
    expect(byId(s).playwright).toMatchObject({ tone: 'neutral', dot: 'hollow', down: true });
    expect(byId(s).mcp?.down).toBeUndefined();
  });

  it('has no chip for a stopped service, and none for the session', () => {
    const s = status({ session: { current: { id: 7 }, count: 1 } as StatusDto['session'] });
    s.mcp.state = 'stopped';
    expect(Object.keys(byId(s))).toEqual(['playwright']);
    s.playwright.state = 'stopped';
    expect(deriveChips(s, true)).toEqual([]);
  });

  it('shows one error chip when the bridge is unreachable', () => {
    expect(deriveChips(status(), false)).toEqual([
      expect.objectContaining({ id: 'bridge', text: 'Bridge unreachable', tone: 'error' }),
    ]);
  });

  it('has no chips before the first answer', () => {
    expect(deriveChips(null, true)).toEqual([]);
  });
});

describe('announcement', () => {
  it('is empty while everything is fine', () => {
    expect(announcement(deriveChips(status(), true), true)).toBe('');
  });

  it('names the problems', () => {
    const s = status();
    s.mcp.state = 'failed';
    expect(announcement(deriveChips(s, true), true)).toBe('MCP 0.0.85, failed.');
  });

  it('says when the bridge is unreachable', () => {
    expect(announcement(deriveChips(status(), false), false)).toBe('Bridge unreachable.');
  });
});
