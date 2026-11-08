import raw from '../release.config.json' with { type: 'json' };

/** A published package. Its scope in commit titles decides when and how it is released. */
export interface ReleasePackage {
  /** Scope in commit titles, e.g. `bridge` in `feat(bridge): …`. */
  scope: string;
  /** npm name; tags are `<name>@<version>`. */
  name: string;
  /** Package directory, relative to the repo root. */
  dir: string;
}

export interface ReleaseConfig {
  /** Publishing from this branch releases stable versions; other branches publish previews. */
  mainBranch: string;
  packages: ReleasePackage[];
  /** Directories bundled into every package (a change there may affect any of them). */
  sharedDirs: string[];
  /** Scopes that are allowed but never release anything on their own. */
  otherScopes: string[];
}

export const config: ReleaseConfig = raw;
