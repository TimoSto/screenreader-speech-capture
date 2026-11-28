import { HOST_NAME_PATTERN, PLAYWRIGHT_MCP_PATH } from '@screenreader-speech-capture/shared';

// The short setup steps of the Setup page, filled with the bridge's live values. Their home is
// docs/usage/vm-setup.md (a test checks the commands against it).

/** The port the default socket voice sends to, and the one the bridge listens on by default. */
export const DEFAULT_TCP_PORT = 4449;
export const DEFAULT_HTTP_PORT = 5151;
const DEFAULT_VOICE_HOST = '127.0.0.1';

/** Installs the socket voice and registers the default one. */
export const INSTALL_VOICE = 'npm install -g text-to-socket-engine\ntext-to-socket-engine-register';

export type VoiceSetup = {
  /** What the screen reader lists the voice as. */
  name: string;
  /** Adds a voice that sends to the bridge; `null` when the default voice already does. */
  addVoice: string | null;
};

/** The socket voice for a bridge that listens on `host` and `port` (`tcp` of the status). */
export function voiceSetup({ host, port }: { host: string; port: number }): VoiceSetup {
  // The voice runs on the bridge's machine, so it reaches a wildcard listener over loopback.
  const target = ['0.0.0.0', '::', 'localhost'].includes(host) ? DEFAULT_VOICE_HOST : host;
  const name = `Text To Socket ${target}:${port}`;
  if (target === DEFAULT_VOICE_HOST && port === DEFAULT_TCP_PORT) return { name, addVoice: null };
  const id = `ssc${port}`;
  return {
    name,
    addVoice: `text-to-socket-engine-add-voice ${id} "${name}" ${target} ${port} voice=${id}`,
  };
}

export type BridgeAddress = {
  /** The bridge's URL as another machine reaches it. */
  url: string;
  /** The URL holds `<vm-ip>`: the page's own address wouldn't work from another machine. */
  placeholder: boolean;
};

const isLoopback = (host: string): boolean =>
  ['localhost', '::1', '[::1]'].includes(host) || /^127(\.\d+){3}$/.test(host);

/**
 * The address for the test machine: the one the page was opened with, which evidently reaches the
 * bridge. Opened over loopback (or by a name that doesn't belong in a command), the address is left
 * open and only the bridge's HTTP port is filled in.
 */
export function bridgeAddress(
  page: { hostname: string; origin: string },
  httpPort: number,
): BridgeAddress {
  const { hostname, origin } = page;
  const plain =
    /^\[[0-9a-fA-F:.]+\]$/.test(hostname) || (hostname !== '*' && HOST_NAME_PATTERN.test(hostname));
  return plain && !isLoopback(hostname) && hostname !== '0.0.0.0'
    ? { url: origin, placeholder: false }
    : { url: `http://<vm-ip>:${httpPort}`, placeholder: true };
}

/** Whether `http.host` keeps other machines out. */
export function listensOnLoopbackOnly(httpHost: string): boolean {
  return isLoopback(httpHost);
}

/** Opens the bridge's HTTP port in the Windows firewall (administrator PowerShell). */
export function firewallCommand(httpPort: number): string {
  return (
    'New-NetFirewallRule -DisplayName "screenreader-speech-capture" `\n' +
    `  -Direction Inbound -Protocol TCP -LocalPort ${httpPort} -Action Allow -Profile Any`
  );
}

/** Stores the bridge's address for the client, and checks it. */
export function clientCommands(url: string): string {
  return [
    `npx screenreader-speech-capture-client config set url ${url}`,
    'npx screenreader-speech-capture-client status',
  ].join('\n');
}

/** The test project's packages; Playwright must match the bridge's version exactly. */
export function playwrightInstall(version: string): string {
  return `npm i -D screenreader-speech-capture-client @playwright/test@${version} @types/node`;
}

/** The entry of an MCP client's configuration for the bridge's Playwright MCP. */
export function mcpClientConfig(url: string): string {
  const server = { url: `${url}${PLAYWRIGHT_MCP_PATH}` };
  return JSON.stringify({ mcpServers: { 'screenreader-vm': server } }, null, 2);
}

/** Puts text on the viewer's clipboard. */
export interface Clipboard {
  /** `false` when the browser didn't take it. */
  copy(text: string): Promise<boolean>;
}
