// The bridge configuration: model, defaults, validation (the shared `ConfigPatchSchema`) and
// field diffs. Import from here.
export { DEFAULT_CONFIG } from './defaults.js';
export { configFields, overriddenFields } from './fields.js';
export { assertDistinctPorts, mergeConfig, mergePatch, validatePatch } from './merge.js';
export {
  LOG_LEVELS,
  type Config,
  type ConfigField,
  type ConfigPatch,
  type LogLevel,
} from './types.js';
