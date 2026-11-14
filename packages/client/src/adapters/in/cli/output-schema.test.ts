import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLI_OUTPUT } from './output.js';
import { cliOutputSchema, SCHEMA_FILE } from './output-schema.js';

describe('docs/usage/cli-output.schema.json', () => {
  it('is generated from the CLI output schemas (run `pnpm cli-schema` after a change)', () => {
    const file = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as unknown;
    expect(file).toEqual(JSON.parse(JSON.stringify(cliOutputSchema())));
  });

  it('only refers to entries that exist', () => {
    const schema = cliOutputSchema() as { $defs: Record<string, unknown> };
    const refs = JSON.stringify(schema).match(/"\$ref":"#\/\$defs\/[^"]+"/g) ?? [];
    const names = refs.map((ref) => decodeURIComponent(ref.slice('"$ref":"#/$defs/'.length, -1)));
    expect(names.filter((name) => !(name in schema.$defs))).toEqual([]);
  });

  it('has an entry for every command', () => {
    const { $defs } = cliOutputSchema() as { $defs: Record<string, unknown> };
    for (const command of Object.keys(CLI_OUTPUT)) expect($defs).toHaveProperty([command]);
  });
});
