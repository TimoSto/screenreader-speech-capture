/** Error codes of the application. The HTTP adapter maps them to status codes. */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'INPUT_DISABLED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

/** An expected error with a stable code, for example a bad request or a timeout. */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** `INVALID_REQUEST` for one field. */
export function invalidField(field: string, message: string): AppError {
  return new AppError('INVALID_REQUEST', `${field}: ${message}`, { field });
}

/** `value` (`fallback` if it is missing), checked to be an integer from `min` to `max`. */
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
