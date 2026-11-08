import type { ReleasePackage } from './config.js';
import { bumpOf, maxBump, parseTitle } from './conventional.js';
import type { Bump } from './conventional.js';
import { formatVersion, nextVersion, parseVersion } from './version.js';
import type { Version } from './version.js';

export interface Commit {
  sha: string;
  subject: string;
}

export interface ReleaseEntry {
  kind: 'breaking' | 'feature' | 'fix';
  description: string;
  pr: number | null;
  sha: string;
}

export interface PackagePlan {
  pkg: ReleasePackage;
  last: string;
  bump: Bump | null;
  /** The version to release, or `null` if nothing since `last` releases this package. */
  version: string | null;
  entries: ReleaseEntry[];
}

/**
 * Plans the next release of one package from the commits since its last release (newest first, as
 * `git log` lists them). Commits whose title doesn't parse or doesn't name the package are ignored.
 */
export function planRelease(
  pkg: ReleasePackage,
  last: string,
  commits: readonly Commit[],
): PackagePlan {
  const lastVersion = parseLast(pkg, last);
  const { bump, entries } = collect(pkg, commits);
  const version = bump === null ? null : formatVersion(nextVersion(lastVersion, bump, null));
  return { pkg, last, bump, version, entries };
}

/**
 * Plans a preview of one package from a branch: `<next version>-<slug>.<run>`. A package is
 * previewed when its files changed on the branch (`changed`), even without a releasing commit
 * title (then as a patch).
 */
export function planPreview(
  pkg: ReleasePackage,
  last: string,
  commits: readonly Commit[],
  changed: boolean,
  slug: string,
  run: number,
): PackagePlan {
  const lastVersion = parseLast(pkg, last);
  const { bump, entries } = collect(pkg, commits);
  if (!changed) return { pkg, last, bump, version: null, entries };
  const next = nextVersion(lastVersion, bump ?? 'patch', null);
  const version = formatVersion({ ...next, pre: { id: slug, n: run } });
  return { pkg, last, bump: bump ?? 'patch', version, entries };
}

function parseLast(pkg: ReleasePackage, last: string): Version {
  const version = parseVersion(last);
  if (!version) throw new Error(`${pkg.name}: last version ${last} is not a valid version`);
  return version;
}

function collect(
  pkg: ReleasePackage,
  commits: readonly Commit[],
): { bump: Bump | null; entries: ReleaseEntry[] } {
  let bump: Bump | null = null;
  const entries: ReleaseEntry[] = [];
  for (const commit of [...commits].reverse()) {
    const title = parseTitle(commit.subject);
    if (!title?.scopes.includes(pkg.scope)) continue;
    const commitBump = bumpOf(title);
    if (commitBump === null) continue;
    bump = maxBump(bump, commitBump);
    entries.push({
      kind: title.breaking ? 'breaking' : title.type === 'feat' ? 'feature' : 'fix',
      description: title.description,
      pr: title.pr,
      sha: commit.sha,
    });
  }
  return { bump, entries };
}
