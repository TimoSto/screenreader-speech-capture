import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { API_VERSION } from '../api-version.js';
import { componentSchemas, OPENAPI_FILE } from './generate.js';

const spec = parse(readFileSync(OPENAPI_FILE, 'utf8')) as {
  info: { version: string };
  components: { schemas: Record<string, unknown> };
};

/** Every `$ref` string anywhere in `value`. */
function refs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === '$ref' && typeof inner === 'string' ? [inner] : refs(inner),
  );
}

describe('docs/usage/openapi.yaml', () => {
  it('has the schemas generated from packages/shared (run `pnpm openapi` after a change)', () => {
    // Compared as data: formatting (Prettier) doesn't matter.
    expect(spec.components.schemas).toEqual(JSON.parse(JSON.stringify(componentSchemas())));
  });

  it('only refers to schemas that exist', () => {
    const missing = refs(spec)
      .filter((ref) => ref.startsWith('#/components/schemas/'))
      .map((ref) => ref.slice('#/components/schemas/'.length))
      .filter((name) => !(name in spec.components.schemas));
    expect(missing).toEqual([]);
  });

  it('describes the API version the code speaks', () => {
    expect(spec.info.version).toBe(API_VERSION);
  });
});
