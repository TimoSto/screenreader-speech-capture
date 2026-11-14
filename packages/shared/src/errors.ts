/** Stable, machine-readable error codes (docs/http-api.md#errors). */
export const ERROR_CODES = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'FORBIDDEN',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
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
