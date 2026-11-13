import type net from 'node:net';
import { AppError } from '../../../domain/errors.js';

/** Thrown when a listener can't use its port (for example `EADDRINUSE`). */
export class ListenError extends Error {
  override readonly name = 'ListenError';

  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Starts `server` on `host:port` and resolves with the bound port (useful with port 0).
 * Rejects with a `ListenError` that says what went wrong, naming the port.
 */
export async function listen(server: net.Server, host: string, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      const reason =
        error.code === 'EADDRINUSE'
          ? 'the port is already in use (is another bridge running?)'
          : error.message;
      reject(new ListenError(`Cannot listen on ${host}:${port}: ${reason}`, error.code));
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
  return (server.address() as net.AddressInfo).port;
}

/**
 * `INVALID_REQUEST` naming the setting, for a listener that can't use a new address
 * (`PUT /api/v1/config`). Any other error is returned as it is.
 */
export function toConfigError(section: 'tcp' | 'http', error: unknown): unknown {
  if (!(error instanceof ListenError)) return error;
  const field = error.code === 'EADDRNOTAVAIL' ? `${section}.host` : `${section}.port`;
  return new AppError('INVALID_REQUEST', `${field}: ${error.message}`, { field });
}
