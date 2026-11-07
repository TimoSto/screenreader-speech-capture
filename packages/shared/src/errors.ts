/** Stable, machine-readable error codes (docs/http-api.md#errors). */
export const ERROR_CODES = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'TIMEOUT',
  'INPUT_DISABLED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  INPUT_DISABLED: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Body of every error response. */
export interface ErrorBodyDto {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
