<script lang="ts">
  import BridgeSetting from '#lib/components/BridgeSetting/BridgeSetting.svelte';
  import { parsePlaywrightVersion } from '#lib/core/config.js';

  type Props = {
    /** The configured version the bridge runs with now; `null` is the bundled one. */
    active: string | null;
    /** The version the next start will use; `null` is the bundled one. */
    saved: string | null;
    /** The version the Playwright server runs (from the status); `null` while unknown. */
    running: string | null;
    /** What sets the version (`--playwright-version`) when a flag or variable does. */
    overriddenBy: string | null;
    /** Rejects with a message to show; resolves when the version is saved. */
    onSave: (version: string | null) => Promise<void>;
  };

  let { active, saved, running, overriddenBy, onSave }: Props = $props();

  const bundled = $derived(running === null ? 'bundled version' : `bundled version (${running})`);
  const inUse = $derived(active ?? bundled);

  function parse(text: string) {
    const parsed = parsePlaywrightVersion(text);
    return parsed.ok ? { ok: true as const, value: parsed.version } : parsed;
  }
</script>

<BridgeSetting
  label="Playwright version"
  noun="version"
  helpText="The exact version of the Playwright server, like 1.65.0. Use the version your tests use. Leave empty for the bundled version."
  {saved}
  {active}
  {overriddenBy}
  format={(version: string | null) => version ?? ''}
  {parse}
  {inUse}
  {onSave}
>
  {#snippet notice()}
    <strong>
      Restart the bridge to use
      {saved === null ? 'the bundled Playwright version' : `Playwright ${saved}`}.
    </strong>
    It still runs {active === null ? `the ${bundled}` : `version ${active}`} until it is restarted. The
    first start of a new version installs it, which can take a minute or two. Your test projects need
    the same version.
  {/snippet}
</BridgeSetting>
