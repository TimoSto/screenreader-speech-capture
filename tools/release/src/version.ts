import type { Bump } from './conventional.js';

/** The subset of semver we publish: `x.y.z` or `x.y.z-<id>.<n>`. */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: { id: string; n: number } | null;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)\.(\d+))?$/;

export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] === undefined ? null : { id: m[4], n: Number(m[5]) },
  };
}

export function formatVersion(v: Version): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.pre ? `${base}-${v.pre.id}.${v.pre.n}` : base;
}

/** Semver precedence: negative if `a < b`. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0);
  if (a.pre.id !== b.pre.id) return a.pre.id < b.pre.id ? -1 : 1;
  return a.pre.n - b.pre.n;
}

function increment(v: Version, bump: Bump): Version {
  if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0, pre: null };
  if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0, pre: null };
  return { major: v.major, minor: v.minor, patch: v.patch + 1, pre: null };
}

/** Whether the (unreleased) base of a prerelease already contains a bump of this size. */
function covers(v: Version, bump: Bump): boolean {
  if (bump === 'major') return v.minor === 0 && v.patch === 0;
  if (bump === 'minor') return v.patch === 0;
  return true;
}

/**
 * The version after `last` for a release with this bump.
 *
 * - With a `channel` (prerelease id), versions are prereleases: a prerelease whose base already
 *   covers the bump only counts up (`0.1.0-preview.0` + fix → `0.1.0-preview.1`), otherwise the
 *   base moves (`0.1.0-preview.1` + breaking → `1.0.0-preview.0`).
 * - Without a channel, a prerelease whose base covers the bump is released as that base.
 */
export function nextVersion(last: Version, bump: Bump, channel: string | null): Version {
  const base = { ...last, pre: null };
  const covered = last.pre !== null && covers(last, bump);
  if (channel === null) return covered ? base : increment(base, bump);
  if (covered) {
    const n = last.pre?.id === channel ? last.pre.n + 1 : 0;
    return { ...base, pre: { id: channel, n } };
  }
  return { ...increment(base, bump), pre: { id: channel, n: 0 } };
}
