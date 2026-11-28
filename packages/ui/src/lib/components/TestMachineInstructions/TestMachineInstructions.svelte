<script lang="ts">
  import { resolve } from '$app/paths';
  import type { ServiceStatusDto } from '@screenreader-speech-capture/shared';
  import CommandBlock from '#lib/components/CommandBlock/CommandBlock.svelte';
  import ExternalLink from '#lib/components/ExternalLink/ExternalLink.svelte';
  import {
    clientCommands,
    firewallCommand,
    mcpClientConfig,
    playwrightInstall,
    type BridgeAddress,
  } from '#lib/core/instructions.js';
  import { docsUrl } from '#lib/core/setup.js';

  type Props = {
    address: BridgeAddress;
    /** The page is opened on the bridge's machine: nothing shows yet that others reach it. */
    local: boolean;
    /** `http.host` keeps other machines out. */
    loopbackOnly: boolean;
    httpPort: number;
    /** The services as the status has them; `null` until known. */
    playwright: ServiceStatusDto | null;
    mcp: ServiceStatusDto | null;
    version: string | null;
    onCopy: (text: string) => Promise<boolean>;
  };

  let { address, local, loopbackOnly, httpPort, playwright, mcp, version, onCopy }: Props =
    $props();

  const docs = (path: string) => docsUrl(version, path);
</script>

<section class="part" aria-labelledby="machine-heading">
  <h2 id="machine-heading">Test machine</h2>

  {#if loopbackOnly}
    <p class="warning">
      The bridge only listens on its own machine, so other machines can't connect. Start it without
      <code>--host</code>, or with an address they reach.
    </p>
  {/if}

  {#if local}
    <p>
      Windows can block the port without asking. On the bridge's machine, in an
      <strong>administrator</strong> PowerShell (<ExternalLink
        href={docs('usage/vm-setup.md#firewall')}>firewall</ExternalLink
      >):
    </p>
    <CommandBlock label="the firewall command" text={firewallCommand(httpPort)} {onCopy} />
  {:else}
    <p>This machine already reaches the bridge, so the firewall lets it through.</p>
  {/if}

  <p>On the test machine (Node 20 or newer), store the bridge's address and check it:</p>
  <CommandBlock label="the client commands" text={clientCommands(address.url)} {onCopy} />
  {#if address.placeholder}
    <p>
      Replace <code>&lt;vm-ip&gt;</code> with the VM's address: one from the
      <code>HTTP API</code> row of the bridge's start output, or from <code>ipconfig</code> on the VM.
    </p>
  {/if}

  <h3>Playwright tests</h3>
  {#if playwright?.state === 'stopped'}
    <p>The Playwright server is off. <a href={resolve('/settings')}>Turn it on in Settings.</a></p>
  {:else if playwright !== null}
    <p>The test project needs exactly the bridge's Playwright version:</p>
    <CommandBlock
      label="the test packages command"
      text={playwrightInstall(playwright.version)}
      {onCopy}
    />
  {/if}
  <p>
    <ExternalLink href={docs('usage/client.md')}>Set up the tests with the test client</ExternalLink
    >
  </p>

  <h3>AI agents</h3>
  {#if mcp?.state === 'stopped'}
    <p>Playwright MCP is off. <a href={resolve('/settings')}>Turn it on in Settings.</a></p>
  {:else}
    <p>Point the agent's MCP client at the bridge:</p>
    <CommandBlock label="the MCP configuration" text={mcpClientConfig(address.url)} {onCopy} />
  {/if}
  <p>
    <ExternalLink href={docs('usage/agents.md')}>How agents use the bridge</ExternalLink>
  </p>
</section>

<style>
  p {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .warning {
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--app-warning-container);
    color: var(--app-on-warning-container);
  }

  h3 {
    margin: 16px 0 4px;
    color: var(--md-sys-color-on-surface);
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  }

  code {
    font-family: var(--app-font-mono);
    font-size: 0.95em;
  }

  /* The links to the settings; the doc links style themselves. */
  p a {
    color: var(--md-sys-color-primary);
  }
</style>
