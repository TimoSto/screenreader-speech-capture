import type { PackagePlan, ReleaseEntry } from './plan.js';

const SECTIONS: { kind: ReleaseEntry['kind']; heading: string }[] = [
  { kind: 'breaking', heading: 'Breaking changes' },
  { kind: 'feature', heading: 'Features' },
  { kind: 'fix', heading: 'Fixes' },
];

/** GitHub release notes for a planned release (GitHub links `#14` and commit SHAs itself). */
export function renderNotes(plan: PackagePlan): string {
  const parts = SECTIONS.flatMap(({ kind, heading }) => {
    const entries = plan.entries.filter((e) => e.kind === kind);
    if (entries.length === 0) return [];
    const lines = entries.map(
      (e) => `- ${e.description} (${e.pr === null ? e.sha.slice(0, 7) : `#${e.pr}`})`,
    );
    return [`### ${heading}\n\n${lines.join('\n')}`];
  });
  parts.push(`Previous release: \`${plan.pkg.name}@${plan.last}\``);
  return `${parts.join('\n\n')}\n`;
}
