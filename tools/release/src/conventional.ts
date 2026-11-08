/** Conventional Commit titles: `type(scope,scope)!: description`. */

export const TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'chore',
  'ci',
  'build',
  'revert',
] as const;

export type Bump = 'major' | 'minor' | 'patch';

export interface ParsedTitle {
  type: string;
  scopes: string[];
  breaking: boolean;
  description: string;
  /** PR number from a squash-merge suffix like ` (#14)`, if present. */
  pr: number | null;
}

const TITLE = /^(?<type>[a-z]+)(?:\((?<scopes>[^()]*)\))?(?<breaking>!)?: (?<description>\S.*)$/;
const PR_SUFFIX = /\s\(#(?<pr>\d+)\)$/;

/** Parses a commit or PR title. Returns `null` if it isn't a Conventional Commit title. */
export function parseTitle(title: string): ParsedTitle | null {
  const groups = TITLE.exec(title.trim())?.groups;
  if (!groups) return null;
  const description = groups.description ?? '';
  const pr = PR_SUFFIX.exec(description)?.groups?.pr;
  return {
    type: groups.type ?? '',
    scopes: groups.scopes === undefined ? [] : groups.scopes.split(',').map((s) => s.trim()),
    breaking: groups.breaking === '!',
    description: pr === undefined ? description : description.replace(PR_SUFFIX, ''),
    pr: pr === undefined ? null : Number(pr),
  };
}

/** The bump a title asks for in each package it names, or `null` if it releases nothing. */
export function bumpOf(title: ParsedTitle): Bump | null {
  if (title.breaking) return 'major';
  if (title.type === 'feat') return 'minor';
  if (title.type === 'fix' || title.type === 'perf') return 'patch';
  return null;
}

const ORDER: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

export function maxBump(a: Bump | null, b: Bump | null): Bump | null {
  if (a === null) return b;
  if (b === null) return a;
  return ORDER[a] >= ORDER[b] ? a : b;
}
