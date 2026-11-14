// `pnpm cli-schema`: rewrites docs/cli-output.schema.json (Prettier formats it after).
import { writeFileSync } from 'node:fs';
import { cliOutputSchema, SCHEMA_FILE } from './output-schema.js';

writeFileSync(SCHEMA_FILE, `${JSON.stringify(cliOutputSchema(), null, 2)}\n`);
