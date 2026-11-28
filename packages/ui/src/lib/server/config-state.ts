import type { ConfigState } from '#lib/core/config.js';
import type { BridgeApi } from './bridge-api.js';

/**
 * What the Settings page knows about the configuration, in one answer: what runs (`active`), what
 * the next start will use (`saved`) and the settings a flag or variable sets (`overrides`, by
 * dotted path). The page's load and the config route both read it.
 */
export async function readConfigState(bridge: BridgeApi): Promise<ConfigState> {
  const [active, saved, overrides] = await Promise.all([
    bridge.config('active'),
    bridge.config('saved'),
    bridge.configOverrides(),
  ]);
  return { active, saved, overrides: overrides.overrides };
}
