import net from 'node:net';

/** Where to probe a listener on a wildcard host: the loopback address of that family. */
const WILDCARD_PROBE: Record<string, string> = { '0.0.0.0': '127.0.0.1', '::': '::1' };

/** Whether something accepts connections on `host:port`, within `timeoutMs`. */
export function portOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: WILDCARD_PROBE[host] ?? host, port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
