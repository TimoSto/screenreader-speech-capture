import { CONFIG_LIMITS, HOST_NAME_PATTERN } from '@screenreader-speech-capture/shared';
import { isExactVersion } from '../version.js';

/** Checks one value and returns an error message, or `undefined` if it is valid. */
export type Check = (value: unknown) => string | undefined;

export const integer =
  (min: number, max: number): Check =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
      ? undefined
      : `must be an integer from ${min} to ${max}`;

export const port = integer(CONFIG_LIMITS.port.min, CONFIG_LIMITS.port.max);

export const boolean: Check = (value) =>
  typeof value === 'boolean' ? undefined : 'must be true or false';

export const nonEmptyString: Check = (value) =>
  typeof value === 'string' && value.trim() !== '' ? undefined : 'must be a non-empty string';

export const nullableString: Check = (value) =>
  value === null ? undefined : nonEmptyString(value) && 'must be a non-empty string or null';

export const nullableVersion: Check = (value) =>
  value === null || isExactVersion(value)
    ? undefined
    : 'must be an exact version like 1.56.1, or null';

/** Host names without port or scheme, or `*`. */
export const hostList: Check = (value) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === 'string' && HOST_NAME_PATTERN.test(item))
    ? undefined
    : 'must be a list of host names (without port or scheme), or ["*"]';

export const oneOf =
  (values: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && values.includes(value)
      ? undefined
      : `must be one of ${values.join(', ')}`;

export const encoding: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';
  try {
    new TextDecoder(value);
    return undefined;
  } catch {
    return `unknown encoding "${value}"`;
  }
};
