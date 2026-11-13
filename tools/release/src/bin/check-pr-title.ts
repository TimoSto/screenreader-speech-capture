/**
 * CI check for PR titles (they become the squash commit titles that decide the versions).
 *
 *   PR_TITLE='feat(bridge): …' [BASE_REF=origin/main] tsx tools/release/src/bin/check-pr-title.ts
 */
import { appendFileSync } from 'node:fs';
import { checkPrTitle } from '../check.js';
import { config } from '../config.js';
import { changedFilesSince } from '../git.js';

const title = process.env.PR_TITLE;
if (title === undefined) {
  console.error('PR_TITLE is not set.');
  process.exit(2);
}

const inActions = process.env.GITHUB_ACTIONS === 'true';
const result = checkPrTitle(
  title,
  changedFilesSince(process.env.BASE_REF ?? 'origin/main'),
  config,
);

for (const error of result.errors) console.log(inActions ? `::error::${error}` : `error: ${error}`);
for (const warning of result.warnings) {
  console.log(inActions ? `::warning::${warning}` : `warning: ${warning}`);
}

const effects = Object.entries(result.effects)
  .map(([scope, effect]) => `${scope}: ${effect}`)
  .join(', ');
console.log(`Release on merge: ${effects}`);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, `**Release on merge:** ${effects}\n`);

process.exit(result.errors.length > 0 ? 1 : 0);
