import { EXACT_VERSION_PATTERN } from '@screenreader-speech-capture/shared';

/**
 * An exact npm version (`1.56.1`, `1.57.0-beta-1`). Versions end up on an `npm install` command
 * line (`playwright.version`, `adapters/out/npm`), so nothing else may get through.
 */
export function isExactVersion(value: unknown): value is string {
  return typeof value === 'string' && EXACT_VERSION_PATTERN.test(value);
}
