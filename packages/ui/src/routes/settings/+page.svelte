<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ConfigPatchDto } from '@screenreader-speech-capture/shared';
  import {
    PLAYWRIGHT_VERSION,
    TCP_PORT,
    TEXT_ENCODING,
    waitingForRestart,
  } from '#lib/core/settings.js';
  import type { Theme } from '#lib/core/theme.js';
  import { appStores } from '#lib/composition.js';
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

<!-- One pane like the speech log; every setting is a section in it. The page heading is only for
     screen readers: the sections name themselves. -->
<div class="page">
  <div class="pane">
    <h1 class="visually-hidden">Settings</h1>
    <p class="scope intro">
      Bridge settings apply when the bridge is restarted. Appearance applies at once and is kept in
      this browser.
    </p>

    {#if configStore.active !== null && configStore.saved !== null}
      <RestartSummary changes={waiting} reachable={configStore.reachable} onCheck={checkAgain} />

      <section aria-labelledby="capture-heading">
        <h2 id="capture-heading">Speech capture</h2>
        <SettingsForm
          name="speech capture"
          settings={[TCP_PORT, TEXT_ENCODING]}
          active={configStore.active}
          saved={configStore.saved}
          overrides={configStore.overrides}
          {settingContext}
          onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
        />
      </section>

      <section aria-labelledby="playwright-heading">
        <h2 id="playwright-heading">Playwright</h2>
        <SettingsForm
          name="Playwright"
          settings={[PLAYWRIGHT_VERSION]}
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

    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <ThemeSetting value={themeStore.current} onChange={(theme: Theme) => themeStore.set(theme)} />
    </section>
  </div>
</div>

<style>
  /* The same gutter above and below as the Monitor page, so the pane lines up with the rail. */
  .page {
    box-sizing: border-box;
    height: 100%;
    padding: var(--app-gutter) 0;
  }

  .pane {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 16px 24px 24px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-width: max(1px, var(--app-border-width));
    border-radius: 16px;
    background: var(--md-sys-color-surface-container-lowest);
  }

  section {
    max-width: 720px;
  }

  section {
    margin-top: 24px;
  }

  section + section {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }

  .scope {
    margin: 0 0 12px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  @media (max-width: 600px) {
    .pane {
      padding: 12px 12px 16px;
    }
  }

  h2 {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface);
    font-size: 22px;
    font-weight: 500;
    line-height: 28px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
