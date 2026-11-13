import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changedFilesSince, commitsSince, currentBranch, lastTaggedVersion } from './git.js';

// The helpers run git in the current directory, so the tests move into a throwaway repository.
let repo: string;
let previous: string;
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const commit = (file: string, subject: string) => {
  writeFileSync(path.join(repo, file), subject);
  git('add', file);
  git('commit', '-q', '-m', subject);
  return git('rev-parse', 'HEAD');
};

beforeAll(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'release-git-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  commit('a.txt', 'chore: start');
  git('tag', 'pkg@1.2.0');
  git('tag', 'pkg@1.10.0');
  git('tag', 'pkg@1.10.0-preview.1');
  git('tag', 'other@9.0.0');
  git('tag', 'pkg@not-a-version');
  previous = process.cwd();
  process.chdir(repo);
});
afterAll(() => {
  process.chdir(previous);
  rmSync(repo, { recursive: true, force: true });
});

describe('git helpers', () => {
  it('lastTaggedVersion: the highest valid version of that package, compared numerically', () => {
    expect(lastTaggedVersion('pkg')).toBe('1.10.0');
    expect(lastTaggedVersion('other')).toBe('9.0.0');
    expect(lastTaggedVersion('none')).toBeNull();
  });

  it('commitsSince: the first-parent commits after the ref, newest first', () => {
    const a = commit('b.txt', 'feat(pkg): one');
    const b = commit('c.txt', 'fix(pkg): two | with "quotes"');
    expect(commitsSince('pkg@1.10.0')).toEqual([
      { sha: b, subject: 'fix(pkg): two | with "quotes"' },
      { sha: a, subject: 'feat(pkg): one' },
    ]);
    expect(commitsSince('HEAD')).toEqual([]);
  });

  it('currentBranch and changedFilesSince the merge base', () => {
    git('checkout', '-q', '-b', 'topic');
    commit('d.txt', 'feat: on topic');
    expect(currentBranch()).toBe('topic');
    expect(changedFilesSince('main')).toEqual(['d.txt']);
    git('checkout', '-q', 'main');
  });
});
