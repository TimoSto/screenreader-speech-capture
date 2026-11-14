import { describe, expect, it } from 'vitest';
import { checkPrTitle } from './check.js';
import type { ReleaseConfig } from './config.js';

const config: ReleaseConfig = {
  mainBranch: 'main',
  packages: [
    { scope: 'bridge', name: 'screenreader-speech-capture', dir: 'packages/bridge' },
    { scope: 'client', name: 'screenreader-speech-capture-client', dir: 'packages/client' },
  ],
  sharedDirs: ['packages/shared'],
  otherScopes: ['shared', 'fake-speech', 'deps'],
};

const bridgeSrc = 'packages/bridge/src/main.ts';
const clientSrc = 'packages/client/src/main.ts';
const sharedSrc = 'packages/shared/src/index.ts';

describe('checkPrTitle', () => {
  it('accepts a release title and reports its effect', () => {
    expect(checkPrTitle('feat(bridge): markers', [bridgeSrc], config)).toEqual({
      errors: [],
      warnings: [],
      effects: { bridge: 'minor', client: '–' },
    });
  });

  it('reports breaking changes', () => {
    const result = checkPrTitle('fix(bridge,client)!: new DTO', [sharedSrc], config);
    expect(result.errors).toEqual([]);
    expect(result.effects).toEqual({ bridge: 'breaking', client: 'breaking' });
  });

  it('accepts titles that release nothing', () => {
    const result = checkPrTitle('docs: firewall rule', ['docs/usage/vm-setup.md'], config);
    expect(result).toEqual({ errors: [], warnings: [], effects: { bridge: '–', client: '–' } });
  });

  it('rejects a title that is not a Conventional Commit title', () => {
    expect(checkPrTitle('Add markers', [bridgeSrc], config).errors).toEqual([
      expect.stringMatching(/not a Conventional Commit title/),
    ]);
  });

  it('rejects unknown types and scopes', () => {
    expect(checkPrTitle('feature(bridge): x', [bridgeSrc], config).errors).toEqual([
      expect.stringMatching(/Unknown type `feature`/),
    ]);
    expect(checkPrTitle('fix(brigde,bridge): x', [bridgeSrc], config).errors).toEqual([
      expect.stringMatching(/Unknown scope `brigde`/),
    ]);
  });

  it('requires a package scope for releasing types', () => {
    for (const title of ['feat: x', 'fix(shared): x', 'chore(deps)!: x']) {
      expect(checkPrTitle(title, [sharedSrc], config).errors).toEqual([
        expect.stringMatching(/must name at least one of: bridge, client/),
      ]);
    }
  });

  it('rejects a package scope whose package did not change', () => {
    expect(checkPrTitle('fix(bridge,client): x', [bridgeSrc], config).errors).toEqual([
      expect.stringMatching(/Scope `client` is named, but nothing in packages\/client\//),
    ]);
  });

  it('accepts any package scope when shared code changed', () => {
    expect(checkPrTitle('fix(client): x', [sharedSrc], config).errors).toEqual([]);
  });

  it('warns when a released PR changes the source of a package it does not name', () => {
    const result = checkPrTitle('fix(bridge): x', [bridgeSrc, clientSrc], config);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringMatching(/packages\/client\/src changed, but the title doesn't name `client`/),
    ]);
  });

  it('does not warn about test files or non-releasing titles', () => {
    const test = 'packages/client/src/main.test.ts';
    expect(checkPrTitle('fix(bridge): x', [bridgeSrc, test], config).warnings).toEqual([]);
    expect(checkPrTitle('refactor: x', [bridgeSrc, clientSrc], config).warnings).toEqual([]);
  });
});
