import type { ReleaseConfig } from './config.js';
import { TYPES, bumpOf, parseTitle } from './conventional.js';

export interface TitleCheck {
  errors: string[];
  warnings: string[];
  /** What merging the PR releases, per package scope (`minor`, `breaking`, or `–`). */
  effects: Record<string, string>;
}

const FORMAT = 'Expected `type(scope[,scope…])[!]: description`, e.g. `feat(bridge): add markers`.';

const isTest = (file: string) => /\.test\.ts$/.test(file) || file.includes('/test/');
const within = (file: string, dir: string) => file.startsWith(`${dir}/`);

/**
 * Checks that a PR title, which becomes the squash commit title, says which packages it releases.
 * `changedFiles` are the files the PR changes, relative to the repo root.
 */
export function checkPrTitle(
  title: string,
  changedFiles: readonly string[],
  config: ReleaseConfig,
): TitleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const effects: Record<string, string> = {};
  for (const pkg of config.packages) effects[pkg.scope] = '–';

  const parsed = parseTitle(title);
  if (!parsed) {
    errors.push(`Title is not a Conventional Commit title. ${FORMAT}`);
    return { errors, warnings, effects };
  }

  if (!(TYPES as readonly string[]).includes(parsed.type)) {
    errors.push(`Unknown type \`${parsed.type}\`. Allowed: ${TYPES.join(', ')}.`);
  }
  const packageScopes = config.packages.map((p) => p.scope);
  const allowedScopes = [...packageScopes, ...config.otherScopes];
  for (const scope of parsed.scopes) {
    if (!allowedScopes.includes(scope)) {
      errors.push(`Unknown scope \`${scope}\`. Allowed: ${allowedScopes.join(', ')}.`);
    }
  }

  const bump = bumpOf(parsed);
  const named = config.packages.filter((p) => parsed.scopes.includes(p.scope));
  if (bump !== null && named.length === 0) {
    errors.push(
      `\`${parsed.type}${parsed.breaking ? '!' : ''}\` releases a package, so the title must name ` +
        `at least one of: ${packageScopes.join(', ')}. ${FORMAT}`,
    );
  }

  const touchesShared = changedFiles.some((f) => config.sharedDirs.some((d) => within(f, d)));
  for (const pkg of named) {
    if (!touchesShared && !changedFiles.some((f) => within(f, pkg.dir))) {
      errors.push(
        `Scope \`${pkg.scope}\` is named, but nothing in ${pkg.dir}/ or ` +
          `${config.sharedDirs.join(', ')}/ changed.`,
      );
    }
  }

  if (bump !== null) {
    for (const pkg of config.packages) {
      if (named.includes(pkg)) {
        effects[pkg.scope] = parsed.breaking ? 'breaking' : bump;
        continue;
      }
      if (changedFiles.some((f) => within(f, `${pkg.dir}/src`) && !isTest(f))) {
        warnings.push(
          `${pkg.dir}/src changed, but the title doesn't name \`${pkg.scope}\`, so it won't be released.`,
        );
      }
    }
  }

  return { errors, warnings, effects };
}
