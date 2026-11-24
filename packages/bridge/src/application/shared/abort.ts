import { AppError } from '../../domain/errors.js';

/** The error an aborted signal ends a pending request with: its reason, if that is an error. */
export function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('The request was aborted');
}

/** What pending requests (waits, captures) end with when the bridge shuts down. */
export const shuttingDown = () =>
  new AppError('SERVICE_UNAVAILABLE', 'The bridge is shutting down');
