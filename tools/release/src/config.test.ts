import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from './config.js';

const root = path.join(import.meta.dirname, '../../..');

describe('release.config.json', () => {
  it('names each published package by its real directory and npm name', () => {
    for (const { dir, name } of config.packages) {
      const manifest = path.join(root, dir, 'package.json');
      expect(existsSync(manifest), manifest).toBe(true);
      expect((JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name).toBe(name);
    }
  });

  it('has unique scopes, none of them also an "other" scope', () => {
    const scopes = config.packages.map((p) => p.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes.filter((s) => config.otherScopes.includes(s))).toEqual([]);
  });

  it('lists shared directories that exist', () => {
    for (const dir of config.sharedDirs) expect(existsSync(path.join(root, dir)), dir).toBe(true);
  });
});
