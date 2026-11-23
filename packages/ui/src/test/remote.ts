/**
 * Stands in for the `*.remote.ts` modules in component tests, which run without SvelteKit (so
 * without its client transform of remote functions). Every query fails, like an unreachable bridge.
 */
const unreachable = () => ({
  current: undefined,
  refresh: () => Promise.reject(new Error('No server in component tests')),
});

export const getSessions = unreachable;
