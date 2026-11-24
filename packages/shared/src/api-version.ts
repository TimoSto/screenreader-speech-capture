/**
 * `<major>.<minor>` of the HTTP API. Minor versions only add things
 * (docs/usage/http-api.md#versioning).
 */
export const API_VERSION = '1.24';

/** Path prefix of every API route. */
export const API_PREFIX = '/api/v1';

/**
 * Response header with {@link API_VERSION} on every answer under {@link API_PREFIX} (since 1.22),
 * so a client checks the version on each answer instead of asking `GET /status` first.
 */
export const API_VERSION_HEADER = 'X-SR-Speech-Api-Version';
