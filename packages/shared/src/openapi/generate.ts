// Generates `components.schemas` of docs/openapi.yaml from the valibot schemas (`pnpm openapi`).
// The rest of the file (paths, parameters, responses, prose) is written by hand.
import { toJsonSchemaDefs } from '@valibot/to-json-schema';
import path from 'node:path';
import { stringify } from 'yaml';
import { API_SCHEMAS } from '../schemas.js';

export const OPENAPI_FILE = path.resolve(import.meta.dirname, '../../../../docs/openapi.yaml');

export const BEGIN =
  '    # BEGIN GENERATED from packages/shared (pnpm openapi). Do not edit by hand.';
export const END = '    # END GENERATED';

/** The JSON Schemas of the API, by name, with `$ref`s pointing into `components.schemas`. */
export function componentSchemas(): Record<string, unknown> {
  return toJsonSchemaDefs(API_SCHEMAS, {
    target: 'draft-2020-12',
    overrideRef: ({ referenceId }) => `#/components/schemas/${referenceId}`,
  });
}

/** `file` with the generated block replaced by the current schemas. */
export function withGeneratedSchemas(file: string): string {
  const start = file.indexOf(BEGIN);
  const end = file.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `docs/openapi.yaml needs the lines\n${BEGIN}\n${END}\nunder components.schemas`,
    );
  }
  const yaml = stringify(componentSchemas(), {
    lineWidth: 0,
    // Quotes strings such as timestamps that YAML 1.1 tools would read as dates.
    schema: 'yaml-1.1',
    // No `&anchors`: the converter reuses objects, the file should stay plain.
    aliasDuplicateObjects: false,
  })
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `${file.slice(0, start)}${BEGIN}\n${yaml}\n${file.slice(end)}`;
}
