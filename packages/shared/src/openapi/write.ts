// `pnpm openapi`: rewrites docs/usage/openapi.yaml (Prettier formats it after).
import { writeFileSync } from 'node:fs';
import { OPENAPI_FILE, openApiYaml } from './generate.js';

writeFileSync(OPENAPI_FILE, openApiYaml());
