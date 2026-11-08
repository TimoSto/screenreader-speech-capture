/**
 * A branch name as a semver prerelease identifier and npm dist-tag part:
 * `feat/Markers_X` → `feat-markers-x`.
 */
export function slugify(branch: string): string {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  if (slug === '') return 'branch';
  // Purely numeric identifiers would compare as numbers (and must not have leading zeros).
  return /^\d+$/.test(slug) ? `b${slug}` : slug;
}
