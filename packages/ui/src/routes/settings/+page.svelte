<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ConfigPatchDto } from '@screenreader-speech-capture/shared';
  import {
    BUFFER_SIZE,
    LOG_LEVEL,
    MCP_ENABLED,
    PLAYWRIGHT_ENABLED,
    PLAYWRIGHT_VERSION,
    TCP_PORT,
    TEXT_ENCODING,
    waitingForRestart,
  } from '#lib/core/settings.js';
  import type { Theme } from '#lib/core/theme.js';
  import { appStores } from '#lib/composition.js';
  import Pane from '#lib/components/Pane/Pane.svelte';
  import RestartSummary from '#lib/components/RestartSummary/RestartSummary.svelte';
  import SettingsForm from '#lib/components/SettingsForm/SettingsForm.svelte';
  import ThemeSetting from '#lib/components/ThemeSetting/ThemeSetting.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const { config: configStore, status: statusStore, theme: themeStore } = appStores();

  // The config the load read (`+page.server.ts`), already while rendering, so the server's HTML has
  // the settings.
  untrack(() => configStore.seed(data.config));

  // On the server the header's status store is still empty, the layout's load has the status.
  const settingContext = $derived({
    runningPlaywright: (statusStore.status ?? data.status)?.playwright.version ?? null,
    playwrightOff: configStore.saved?.playwright.enabled === false,
  });

  const waiting = $derived(
    configStore.active === null || configStore.saved === null
      ? []
      : waitingForRestart(
          configStore.active,
          configStore.saved,
          configStore.overrides,
          settingContext,
        ),
  );

  async function checkAgain(): Promise<void> {
    await Promise.all([configStore.refresh(), statusStore.retry()]);
  }

  onMount(() => {
    // Only if the load failed: try from the browser, which then says that the bridge is gone.
    if (data.config === null) void configStore.refresh();
  });
</script>

<svelte:head>
  <title>Settings · Speech Capture</title>
</svelte:head>

<Pane heading="Settings">
  <p class="scope intro">
    Bridge settings apply when the bridge is restarted. Appearance applies at once and is kept in
    this browser.
  </p>

  {#if configStore.active !== null && configStore.saved !== null}
    <RestartSummary changes={waiting} reachable={configStore.reachable} onCheck={checkAgain} />

    <section class="part" aria-labelledby="capture-heading">
      <h2 id="capture-heading">Speech capture</h2>
      <SettingsForm
        name="speech capture"
        settings={[TCP_PORT, TEXT_ENCODING, BUFFER_SIZE]}
        active={configStore.active}
        saved={configStore.saved}
        overrides={configStore.overrides}
        {settingContext}
        onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
      />
    </section>

    <section class="part" aria-labelledby="playwright-heading">
      <h2 id="playwright-heading">Playwright and MCP</h2>
      <SettingsForm
        name="Playwright and MCP"
        settings={[[PLAYWRIGHT_ENABLED, PLAYWRIGHT_VERSION], MCP_ENABLED]}
        active={configStore.active}
        saved={configStore.saved}
        overrides={configStore.overrides}
        {settingContext}
        onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
      />
    </section>

    <section class="part" aria-labelledby="log-heading">
      <h2 id="log-heading">Bridge log</h2>
      <SettingsForm
        name="bridge log"
        settings={[LOG_LEVEL]}
        active={configStore.active}
        saved={configStore.saved}
        overrides={configStore.overrides}
        {settingContext}
        onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
      />
    </section>
  {:else if !configStore.reachable}
    <p class="scope" role="alert">
      The bridge is not reachable, so its settings can't be read.
      <button type="button" onclick={() => void configStore.refresh()}>Try again</button>
    </p>
  {:else}
    <p class="scope">Reading the bridge settings…</p>
  {/if}

  <section class="part" aria-labelledby="appearance-heading">
    <h2 id="appearance-heading">Appearance</h2>
    <ThemeSetting value={themeStore.current} onChange={(theme: Theme) => themeStore.set(theme)} />
  </section>
</Pane>
