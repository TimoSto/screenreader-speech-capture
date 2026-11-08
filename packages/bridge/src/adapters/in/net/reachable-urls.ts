import os from 'node:os';

/** True for a host that means "every interface" (`0.0.0.0`, `::`). */
export const isWildcard = (host: string): boolean => ['0.0.0.0', '::', ''].includes(host);

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
  if (!isWildcard(host)) return [`${scheme}://${hostPort(host, port)}`];
  const addresses = Object.values(interfaces)
    .flatMap((infos) => infos ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
  return [...new Set(addresses), 'localhost'].map((a) => `${scheme}://${hostPort(a, port)}`);
}
