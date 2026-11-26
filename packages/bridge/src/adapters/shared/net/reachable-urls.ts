import os from 'node:os';

/** True for a host that means "every interface" (`0.0.0.0`, `::`). */
export const isWildcard = (host: string): boolean => ['0.0.0.0', '::', ''].includes(host);

/** True for a peer address on this machine (`127.0.0.0/8`, `::1`, or either as IPv4-mapped IPv6). */
export const isLoopbackAddress = (address: string | undefined): boolean =>
  address !== undefined && /^(::ffff:)?127\.\d+\.\d+\.\d+$|^::1$/i.test(address);

/**
 * True when `address` (a peer address) belongs to this machine: loopback, or one of its own
 * interface addresses. A page opened through the machine's LAN IP (`http://192.168.x.y:5151`)
 * reaches the bridge from that same address, not from loopback.
 */
export function isOwnAddress(
  address: string | undefined,
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): boolean {
  if (address === undefined) return false;
  if (isLoopbackAddress(address)) return true;
  // `::ffff:192.168.1.5` is IPv4 on a dual-stack socket; `fe80::1%eth0` carries its zone.
  const bare = address
    .replace(/^::ffff:/i, '')
    .replace(/%.*$/, '')
    .toLowerCase();
  return Object.values(interfaces)
    .flatMap((infos) => infos ?? [])
    .some((info) => info.address.replace(/%.*$/, '').toLowerCase() === bare);
}

/** `host:port` for a URL, with an IPv6 host in brackets. */
export function hostPort(host: string, port: number): string {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * URLs other machines can use to reach a listener on `host:port`. For a wildcard host (`0.0.0.0`,
 * `::`) these are the machine's external IPv4 addresses, then `localhost`; otherwise just `host`.
 */
export function reachableUrls(
  scheme: 'http' | 'ws',
  host: string,
  port: number,
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  return reachableHosts(host, interfaces).map((a) => `${scheme}://${hostPort(a, port)}`);
}

/** Hosts for a listener on `host`: itself, or on a wildcard the external IPv4 addresses, then `localhost`. */
function reachableHosts(
  host: string,
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string[] {
  if (!isWildcard(host)) return [host];
  const addresses = Object.values(interfaces)
    .flatMap((infos) => infos ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
  return [...new Set(addresses), 'localhost'];
}

/** Like `describeListener`, without a URL scheme (for the plain TCP socket). */
export function describeAddress(
  host: string,
  port: number,
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string {
  if (!isWildcard(host)) return hostPort(host, port);
  const addresses = reachableHosts(host, interfaces).map((a) => hostPort(a, port));
  return `${hostPort(host, port)}, reachable at ${addresses.join(', ')}`;
}

/**
 * How a listener is named in the log (docs/usage/operations.md#line-format): on a wildcard host,
 * `0.0.0.0:5151, reachable at <urls>`; otherwise just its URL. `path` is appended to each URL.
 */
export function describeListener(
  scheme: 'http' | 'ws',
  host: string,
  port: number,
  path = '',
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string {
  const urls = reachableUrls(scheme, host, port, interfaces)
    .map((url) => `${url}${path}`)
    .join(', ');
  return isWildcard(host) ? `${hostPort(host, port)}, reachable at ${urls}` : urls;
}
