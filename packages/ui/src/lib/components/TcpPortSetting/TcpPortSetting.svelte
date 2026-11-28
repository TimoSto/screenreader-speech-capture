<script lang="ts">
  import BridgeSetting from '#lib/components/BridgeSetting/BridgeSetting.svelte';
  import { parsePort } from '#lib/core/config.js';

  type Props = {
    /** The port the bridge listens on now. */
    active: number;
    /** The port the next start will use. */
    saved: number;
    /** What sets the port (`--tcp-port`) when a flag or variable does: it can't be changed here. */
    overriddenBy: string | null;
    /** Rejects with a message to show; resolves when the port is saved. */
    onSave: (port: number) => Promise<void>;
  };

  let { active, saved, overriddenBy, onSave }: Props = $props();

  function parse(text: string) {
    const parsed = parsePort(text);
    return parsed.ok ? { ok: true as const, value: parsed.port } : parsed;
  }
</script>

<BridgeSetting
  label="TCP port"
  noun="port"
  helpText="The port the screen reader's speech voice sends to. Default 4449."
  inputmode="numeric"
  {saved}
  {active}
  {overriddenBy}
  format={String}
  {parse}
  inUse={String(active)}
  {onSave}
>
  {#snippet notice()}
    <strong>Restart the bridge to use port {saved}.</strong>
    It still listens on {active} until it is restarted. The speech voice on the VM sends to a fixed port,
    so also add a voice for {saved} (<code>text-to-socket-engine-add-voice</code>) and select it in
    the screen reader.
  {/snippet}
</BridgeSetting>

<style>
  code {
    font-family: var(--app-mono-font, monospace);
    font-size: 0.95em;
  }
</style>
