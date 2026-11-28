import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bridgeAddress,
  clientCommands,
  firewallCommand,
  INSTALL_VOICE,
  listensOnLoopbackOnly,
  mcpClientConfig,
  playwrightInstall,
  voiceSetup,
} from './instructions.js';

describe('voiceSetup', () => {
  it.each(['127.0.0.1', 'localhost', '0.0.0.0', '::'])(
    'uses the default voice for a listener on %s',
    (host) => {
      expect(voiceSetup({ host, port: 4449 })).toEqual({
        name: 'Text To Socket 127.0.0.1:4449',
        addVoice: null,
      });
    },
  );

  it('adds a voice for another port', () => {
    expect(voiceSetup({ host: '127.0.0.1', port: 5000 })).toEqual({
      name: 'Text To Socket 127.0.0.1:5000',
      addVoice:
        'text-to-socket-engine-add-voice ssc5000 "Text To Socket 127.0.0.1:5000" 127.0.0.1 5000 voice=ssc5000',
    });
  });

  it.each(['::1', '192.168.1.20'])('adds a voice that sends to %s', (host) => {
    expect(voiceSetup({ host, port: 4449 }).addVoice).toContain(`" ${host} 4449 voice=ssc4449`);
  });
});

describe('bridgeAddress', () => {
  const at = (hostname: string, origin = `http://${hostname}:8080`) =>
    bridgeAddress({ hostname, origin }, 5151);

  it.each(['192.168.122.177', 'win-vm', 'vm.lab.example', '[fd00::5]'])(
    'takes the address the page was opened with: %s',
    (hostname) => {
      expect(at(hostname)).toEqual({ url: `http://${hostname}:8080`, placeholder: false });
    },
  );

  it.each(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'a;b', '*'])(
    'leaves the address open for %s, with the HTTP port',
    (hostname) => {
      expect(at(hostname)).toEqual({ url: 'http://<vm-ip>:5151', placeholder: true });
    },
  );
});

describe('listensOnLoopbackOnly', () => {
  it.each([
    ['127.0.0.1', true],
    ['localhost', true],
    ['::1', true],
    ['0.0.0.0', false],
    ['::', false],
    ['192.168.1.20', false],
  ])('%s: %s', (host, expected) => {
    expect(listensOnLoopbackOnly(host)).toBe(expected);
  });
});

describe('commands for the test machine', () => {
  it('stores the address and checks it', () => {
    expect(clientCommands('http://win-vm:5151')).toBe(
      'npx screenreader-speech-capture-client config set url http://win-vm:5151\n' +
        'npx screenreader-speech-capture-client status',
    );
  });

  it("installs the bridge's Playwright version", () => {
    expect(playwrightInstall('1.65.0')).toContain(' @playwright/test@1.65.0 ');
  });

  it('points an MCP client at the proxied path', () => {
    expect(JSON.parse(mcpClientConfig('http://win-vm:5151'))).toEqual({
      mcpServers: { 'screenreader-vm': { url: 'http://win-vm:5151/playwright-mcp' } },
    });
  });
});

// The page repeats these from the docs (docs/implementation/decisions.md): neither may drift.
describe('the commands in vm-setup.md', () => {
  const docs = readFileSync(
    new URL('../../../../../docs/usage/vm-setup.md', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');

  it.each([
    ['install', INSTALL_VOICE],
    ['add-voice', voiceSetup({ host: '127.0.0.1', port: 5000 }).addVoice!],
    ['firewall', firewallCommand(5151)],
  ])('has the %s command as the page shows it', (_name, command) => {
    expect(docs).toContain(command);
  });
});
