/**
 * Computes the version each package would be published with from the current branch.
 *
 *   tsx tools/release/src/bin/determine-version.ts [--ref <branch>] [--run <n>] [--out <dir>]
 *
 * - On the main branch: stable versions from the commit titles since each package's last tag
 *   (`<name>@<version>`). No releasing title → no release.
 * - On other branches: previews `<next version>-<branch slug>.<run>` of every package whose files
 *   changed since the merge base with main, under the npm dist-tag `preview-<branch slug>`.
 *
 * In GitHub Actions it writes `<scope>_version` (empty: nothing to publish), `<scope>_npm_tag` and
 * `<scope>_release` (`true`: tag + GitHub release) to `$GITHUB_OUTPUT` and a table to
 * `$GITHUB_STEP_SUMMARY`. With `--out`, it writes the release notes to `<dir>/<scope>.md`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { slugify } from '../branch.js';
import { config } from '../config.js';
import { changedFilesSince, commitsSince, currentBranch, lastTaggedVersion } from '../git.js';
import { renderNotes } from '../notes.js';
import { planPreview, planRelease } from '../plan.js';

const { values } = parseArgs({
  options: { ref: { type: 'string' }, run: { type: 'string' }, out: { type: 'string' } },
});
const ref = values.ref ?? process.env.GITHUB_REF_NAME ?? currentBranch();
const run = Number(values.run ?? process.env.GITHUB_RUN_NUMBER ?? '0');
const onMain = ref === config.mainBranch;
const slug = slugify(ref);
const changed = onMain ? [] : changedFilesSince(`origin/${config.mainBranch}`);
if (values.out !== undefined) mkdirSync(values.out, { recursive: true });

console.log(onMain ? `Branch ${ref}: stable releases\n` : `Branch ${ref}: previews (${slug})\n`);
const outputs: string[] = [];
const rows: string[] = [];
for (const pkg of config.packages) {
  const last = lastTaggedVersion(pkg.name);
  if (last === null) {
    console.error(`No tag ${pkg.name}@<version> found. Tag the last published version first.`);
    process.exit(1);
  }
  const commits = commitsSince(`${pkg.name}@${last}`);
  const plan = onMain
    ? planRelease(pkg, last, commits)
    : planPreview(
        pkg,
        last,
        commits,
        changed.some((f) => [pkg.dir, ...config.sharedDirs].some((d) => f.startsWith(`${d}/`))),
        slug,
        run,
      );
  const npmTag = plan.version === null ? '' : onMain ? 'latest' : `preview-${slug}`;
  outputs.push(
    `${pkg.scope}_version=${plan.version ?? ''}`,
    `${pkg.scope}_npm_tag=${npmTag}`,
    `${pkg.scope}_release=${plan.version !== null && onMain}`,
  );
  rows.push(`| ${pkg.name} | ${last} | ${plan.version ?? '–'} | ${npmTag || '–'} |`);

  if (plan.version === null) {
    console.log(`${pkg.name}: nothing to publish (last ${last})`);
    continue;
  }
  const notes = renderNotes(plan);
  console.log(
    `${pkg.name}: ${last} → ${plan.version} (${plan.bump}, npm tag ${npmTag})\n\n${notes}`,
  );
  if (values.out !== undefined) writeFileSync(join(values.out, `${pkg.scope}.md`), notes);
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) appendFileSync(githubOutput, `${outputs.join('\n')}\n`);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const kind = onMain ? 'stable releases' : `previews of branch \`${ref}\``;
  const table = [
    '| Package | Last tag | Publish | npm tag |',
    '| --- | --- | --- | --- |',
    ...rows,
  ];
  appendFileSync(summary, `**Publish would release ${kind}:**\n\n${table.join('\n')}\n`);
}
