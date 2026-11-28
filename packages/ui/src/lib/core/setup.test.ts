import { describe, expect, it } from 'vitest';
import type { StatusDto } from '@screenreader-speech-capture/shared';
import { statusWith } from '../../test/status.js';
import { deriveCheckRows, docsUrl, type CheckRowId } from './setup.js';

const row = (status: StatusDto, id: CheckRowId) =>
  deriveCheckRows(status).find((candidate) => candidate.id === id)!;

describe('docsUrl', () => {
  it('reads the docs of a stable release at its tag', () => {
    expect(docsUrl('0.9.0', 'usage/vm-setup.md#firewall')).toBe(
      'https://github.com/TimoSto/screenreader-speech-capture/blob/screenreader-speech-capture@0.9.0/docs/usage/vm-setup.md#firewall',
    );
  });

  it.each(['0.0.0-dev', '0.1.0-preview.0', null])('reads main for %s', (version) => {
    expect(docsUrl(version, 'usage/web-ui.md')).toBe(
      'https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/web-ui.md',
    );
  });
});

describe('deriveCheckRows', () => {
  it('has one row per thing the bridge knows', () => {
    expect(deriveCheckRows(statusWith()).map(({ id }) => id)).toEqual([
      'listener',
      'voice',
      'input',
      'focus',
      'playwright',
      'mcp',
    ]);
  });

  it('names the port and encoding it listens on, without a help link', () => {
    expect(row(statusWith(), 'listener')).toMatchObject({
      tone: 'ok',
      state: 'Listening on port 4449 (windows-1252)',
      help: null,
    });
  });

  it('warns when the bridge does not listen', () => {
    const tcp = { ...statusWith().tcp, listening: false };
    expect(row(statusWith({ tcp }), 'listener')).toMatchObject({
      tone: 'warning',
      state: 'Not listening on port 4449',
    });
  });

  it('does not warn before the voice connected', () => {
    const voice = row(statusWith(), 'voice');
    expect(voice.tone).toBe('neutral');
    expect(voice.state).toContain('connects with its first words');
    expect(voice.help).toEqual({ label: 'Select the voice', screenReader: true });
  });

  it('counts the voice connections and names each voice once', () => {
    const connectedAt = '2026-11-12T09:00:00.000Z';
    const tcp = {
      ...statusWith().tcp,
      connections: [
        { id: 1, voice: 'voiceDe', connectedAt },
        { id: 2, voice: 'voiceDe', connectedAt },
        { id: 3, voice: null, connectedAt },
      ],
    };
    expect(row(statusWith({ tcp }), 'voice')).toMatchObject({
      tone: 'ok',
      state: '3 connections (voice voiceDe)',
    });
  });

  it.each([
    ['input', 'robotjs', 'https://github.com/jitsi/robotjs'],
    ['focus', 'koffi', 'https://github.com/Koromix/koffi'],
  ] as const)('names the library behind %s with its repository', (id, name, href) => {
    expect(row(statusWith(), id)).toMatchObject({ state: 'Available', library: { name, href } });
  });

  it('names an unknown library without a link', () => {
    const other = { available: true, backend: 'other', reason: null };
    const status = statusWith({ input: { native: other, focus: other } });
    expect(row(status, 'input').library).toEqual({ name: 'other', href: null });
  });

  it('links a warning to the docs of the release', () => {
    const tcp = { ...statusWith().tcp, listening: false };
    expect(row(statusWith({ tcp }), 'listener').help).toMatchObject({
      href: expect.stringContaining('@0.9.0/docs/usage/troubleshooting.md#speech') as string,
    });
  });

  it('says why native input and focus are not available', () => {
    const off = { available: false, backend: null, reason: 'only on Windows' };
    const status = statusWith({ input: { native: off, focus: off } });
    for (const id of ['input', 'focus'] as const) {
      expect(row(status, id)).toMatchObject({
        tone: 'warning',
        state: 'Not available: only on Windows',
        library: null,
      });
    }
  });

  it.each([
    ['running', 'ok', 'Running, version 1.65.0'],
    ['starting', 'neutral', 'Starting, version 1.65.0'],
    ['stopped', 'neutral', 'Off'],
    ['crashed', 'warning', 'Crashed, version 1.65.0. It restarts by itself.'],
    ['failed', 'warning', 'Failed, version 1.65.0'],
  ] as const)('shows a %s service', (state, tone, words) => {
    const playwright = { ...statusWith().playwright, state };
    expect(row(statusWith({ playwright }), 'playwright')).toMatchObject({ tone, state: words });
  });
});
