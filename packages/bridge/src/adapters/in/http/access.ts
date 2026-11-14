import type http from 'node:http';
import net from 'node:net';
import { AppError } from '../../../domain/errors.js';

// Protection against DNS rebinding and cross-site requests (docs/security.md#host-and-origin).
// A page in the VM's browser can point a domain of its own at the bridge and so become
// same-origin with it, or post a form to it. The `Host` header shows the first, the `Origin`
// header the second.

export interface AccessRules {
  /** `http.allowedHosts`: more accepted host names. `*` accepts any. */
  allowedHosts: readonly string[];
  /** This machine's names (`os.hostname()`), accepted like `localhost`. */
  ownHostnames: readonly string[];
}

/** Methods that don't change anything. Other methods with a foreign `Origin` are refused. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Throws `FORBIDDEN` if the request comes through a foreign host name or from a foreign page. */
export function checkAccess(req: http.IncomingMessage, rules: AccessRules): void {
  const host = (req.headers.host ?? '').toLowerCase();
  const hostname = hostnameOf(host);
  if (hostname === undefined) {
    throw new AppError('FORBIDDEN', 'The request has no valid Host header');
  }
  if (!hostAllowed(hostname, rules)) {
    throw new AppError(
      'FORBIDDEN',
      `Host "${hostname}" is not allowed. Use the bridge's IP address, or add the name to ` +
        'http.allowedHosts (--allowed-hosts)',
      { host: hostname },
    );
  }

  const origin = req.headers.origin;
  if (origin === undefined || SAFE_METHODS.has(req.method ?? 'GET')) return;
  if (origin.toLowerCase() !== `http://${host}`) {
    throw new AppError('FORBIDDEN', `Requests from origin "${origin}" are not allowed`, {
      origin,
    });
  }
}

/** The host name in a `Host` header (`name:port`, `[::1]:port`), `undefined` if it isn't one. */
function hostnameOf(host: string): string | undefined {
  if (host === '') return undefined;
  try {
    const { hostname } = new URL(`http://${host}`);
    // `new URL` keeps the brackets around IPv6 addresses.
    return hostname.replace(/^\[(.*)\]$/, '$1');
  } catch {
    return undefined;
  }
}

function hostAllowed(hostname: string, { allowedHosts, ownHostnames }: AccessRules): boolean {
  if (net.isIP(hostname) !== 0 || hostname === 'localhost') return true;
  const names = [...allowedHosts, ...ownNames(ownHostnames)].map((name) => name.toLowerCase());
  return names.includes('*') || names.includes(hostname);
}

/**
 * The machine's names as given, plus their first label (`win-vm` for `win-vm.lab.example`). No
 * other suffixes: a page could register `win-vm.example.com` for itself.
 */
function ownNames(hostnames: readonly string[]): string[] {
  return hostnames.flatMap((name) => [name, name.split('.')[0]!]).filter((name) => name !== '');
}
