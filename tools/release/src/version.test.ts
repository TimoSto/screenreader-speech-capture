import { describe, expect, it } from 'vitest';
import type { Bump } from './conventional.js';
import { compareVersions, formatVersion, nextVersion, parseVersion } from './version.js';

const v = (text: string) => {
  const parsed = parseVersion(text);
  if (!parsed) throw new Error(`invalid version ${text}`);
  return parsed;
};

describe('parseVersion / formatVersion', () => {
  it.each(['1.2.3', '0.0.1-preview.5'])('round-trips %s', (text) => {
    expect(formatVersion(v(text))).toBe(text);
  });

  it.each(['1.2', '1.2.3-preview', '0.0.0-stage', 'v1.2.3'])('rejects %s', (text) => {
    expect(parseVersion(text)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('sorts by semver precedence', () => {
    const sorted = ['1.0.0', '0.1.0-preview.2', '0.0.1-preview.10', '0.1.0', '0.0.1-preview.9']
      .map(v)
      .sort(compareVersions)
      .map(formatVersion);
    expect(sorted).toEqual([
      '0.0.1-preview.9',
      '0.0.1-preview.10',
      '0.1.0-preview.2',
      '0.1.0',
      '1.0.0',
    ]);
  });
});

describe('nextVersion', () => {
  it.each<[string, Bump, string | null, string]>([
    // Preview channel: count up while the unreleased base covers the bump.
    ['0.0.1-preview.5', 'patch', 'preview', '0.0.1-preview.6'],
    ['0.0.1-preview.5', 'minor', 'preview', '0.1.0-preview.0'],
    ['0.1.0-preview.0', 'patch', 'preview', '0.1.0-preview.1'],
    ['0.1.0-preview.0', 'minor', 'preview', '0.1.0-preview.1'],
    // Breaking while 0.x is a minor bump.
    ['0.1.0-preview.1', 'major', 'preview', '0.1.0-preview.2'],
    ['0.1.3', 'major', 'preview', '0.2.0-preview.0'],
    ['1.2.0-preview.1', 'major', 'preview', '2.0.0-preview.0'],
    ['2.0.0-preview.1', 'major', 'preview', '2.0.0-preview.2'],
    // From a stable version into the channel.
    ['0.1.0', 'patch', 'preview', '0.1.1-preview.0'],
    // Another channel starts at 0.
    ['0.1.0-beta.3', 'patch', 'preview', '0.1.0-preview.0'],
    // Without a channel: release the covered base, otherwise increment.
    ['0.1.0-preview.4', 'patch', null, '0.1.0'],
    ['0.0.1-preview.5', 'minor', null, '0.1.0'],
    ['1.2.3', 'patch', null, '1.2.4'],
    ['1.2.3', 'minor', null, '1.3.0'],
    ['1.2.3', 'major', null, '2.0.0'],
    ['0.4.1', 'major', null, '0.5.0'],
  ])('%s + %s (channel %s) → %s', (last, bump, channel, expected) => {
    expect(formatVersion(nextVersion(v(last), bump, channel))).toBe(expected);
  });
});
