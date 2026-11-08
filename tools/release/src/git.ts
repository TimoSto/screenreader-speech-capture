import { execFileSync } from 'node:child_process';
import type { Commit } from './plan.js';
import { compareVersions, formatVersion, parseVersion } from './version.js';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/** The highest version tagged as `<name>@<version>`, or `null` if there is none. */
export function lastTaggedVersion(name: string): string | null {
  const versions = git('tag', '--list', `${name}@*`)
    .split('\n')
    .map((tag) => parseVersion(tag.slice(name.length + 1)))
    .filter((v) => v !== null)
    .sort(compareVersions);
  const last = versions.at(-1);
  return last ? formatVersion(last) : null;
}

/** Commits on the first-parent line from `ref` (exclusive) to HEAD, newest first. */
export function commitsSince(ref: string): Commit[] {
  return git('log', '--first-parent', '--format=%H%x1f%s%x1e', `${ref}..HEAD`)
    .split('\x1e')
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', subject = ''] = record.split('\x1f');
      return { sha, subject };
    });
}

export function currentBranch(): string {
  return git('rev-parse', '--abbrev-ref', 'HEAD').trim();
}

/** Files changed between the merge base of `base` and HEAD. */
export function changedFilesSince(base: string): string[] {
  return git('diff', '--name-only', `${base}...HEAD`)
    .split('\n')
    .filter((file) => file !== '');
}
