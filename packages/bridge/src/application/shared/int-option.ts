import { invalidField } from '../../domain/errors.js';

/**
 * A numeric use-case option: `fallback` if it is missing, otherwise checked to be an integer
 * from `min` to `max` (`INVALID_REQUEST` for `field` if not).
 */
export function intOption(
  field: string,
  value: number | undefined,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalidField(field, `must be an integer from ${min} to ${max}`);
  }
  return value;
}
