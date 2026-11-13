import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledMcp } from './playwright-mcp.js';

describe('bundledMcp', () => {
  it('is the @playwright/mcp version the bridge depends on, with its cli.js', () => {
    const manifest = path.join(import.meta.dirname, '../../../../package.json');
    const { dependencies } = JSON.parse(readFileSync(manifest, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const { version, cli } = bundledMcp();
    expect(version).toBe(dependencies['@playwright/mcp']);
    expect(path.basename(cli)).toBe('cli.js');
    expect(existsSync(cli)).toBe(true);
  });
});
