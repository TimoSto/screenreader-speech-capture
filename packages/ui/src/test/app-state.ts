/** Stands in for SvelteKit's `$app/state` in component tests, which run without SvelteKit. */
export const page: { data: { status: unknown } } = { data: { status: null } };
