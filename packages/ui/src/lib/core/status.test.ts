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

  it('keeps a starting or stopped service neutral, with a red (down) dot', () => {
    const s = status();
    s.playwright.state = 'starting';
    expect(byId(s).playwright).toMatchObject({ tone: 'neutral', dot: 'hollow', down: true });
    s.playwright.state = 'stopped';
    expect(byId(s).playwright?.down).toBe(true);
    expect(byId(s).mcp?.down).toBeUndefined();
  });

  it('says "No session" before the first session, then the live id', () => {
    expect(byId(status()).session).toMatchObject({
      text: 'No session',
      tone: 'neutral',
      dot: 'hollow',
    });
    const live = status({
      session: { current: { id: 7 }, count: 1 } as StatusDto['session'],
    });
    expect(byId(live).session).toMatchObject({ text: 'Session #7', tone: 'ok', dot: 'filled' });
  });

  it('greys every chip out when the bridge is unreachable', () => {
    const chips = deriveChips(status(), false);
    expect(chips.every((chip) => chip.tone === 'neutral' && chip.down)).toBe(true);
    expect(chips.find((chip) => chip.id === 'mcp')?.text).toBe('MCP 0.0.85');
  });

  it('has neutral placeholder chips before the first answer', () => {
    const chips = deriveChips(null, false);
    expect(chips.map((chip) => chip.text)).toEqual(['Playwright', 'MCP', 'Session']);
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
