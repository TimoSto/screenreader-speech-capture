import * as v from 'valibot';

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

export const ErrorCodeSchema = v.pipe(
  v.picklist(ERROR_CODES),
  v.description('Stable, machine-readable. New codes may be added in minor versions.'),
);

export const ErrorBodySchema = v.pipe(
  v.object({
    error: v.object({
      code: ErrorCodeSchema,
      message: v.string(),
      details: v.optional(v.record(v.string(), v.unknown())),
    }),
  }),
  v.description(
    'Body of every error response. HTTP status per code: `INVALID_REQUEST` 400, `FORBIDDEN` ' +
      '403, `NOT_FOUND` 404 (also for unknown endpoints), `SERVICE_UNAVAILABLE` 503, ' +
      '`INTERNAL` 500.',
  ),
);

/** Body of every error response. */
export type ErrorBodyDto = v.InferOutput<typeof ErrorBodySchema>;
