// `pnpm openapi`: rewrites the generated schemas in docs/openapi.yaml (Prettier formats it after).
import { readFileSync, writeFileSync } from 'node:fs';
import { OPENAPI_FILE, withGeneratedSchemas } from './generate.js';

writeFileSync(OPENAPI_FILE, withGeneratedSchemas(readFileSync(OPENAPI_FILE, 'utf8')));
