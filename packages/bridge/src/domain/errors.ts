/** Error codes of the application. The HTTP adapter maps them to status codes. */
export type ErrorCode =
  'INVALID_REQUEST' | 'NOT_FOUND' | 'INPUT_DISABLED' | 'SERVICE_UNAVAILABLE' | 'INTERNAL';

/** An expected error with a stable code, for example a bad request. */
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
