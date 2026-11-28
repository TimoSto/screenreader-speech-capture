<script lang="ts">
  import { onMount } from 'svelte';
  import type { ConfigPatchDto } from '@screenreader-speech-capture/shared';
  import { PLAYWRIGHT_VERSION, TCP_PORT } from '#lib/core/settings.js';
  import type { Theme } from '#lib/core/theme.js';
  import { appStores } from '#lib/composition.js';
  import SettingsForm from '#lib/components/SettingsForm/SettingsForm.svelte';
  import ThemeSetting from '#lib/components/ThemeSetting/ThemeSetting.svelte';

  const { config: configStore, status: statusStore, theme: themeStore } = appStores();

  const settingContext = $derived({
    runningPlaywright: statusStore.status?.playwright.version ?? null,
  });

  onMount(() => {
    void configStore.refresh();
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

    <section aria-labelledby="capture-heading">
      <h2 id="capture-heading">Speech capture</h2>
      <p class="scope">Saved on the bridge. A change takes effect when the bridge is restarted.</p>
      {#if configStore.active !== null && configStore.saved !== null}
        <SettingsForm
          settings={[TCP_PORT]}
          active={configStore.active}
          saved={configStore.saved}
          overrides={configStore.overrides}
          {settingContext}
          onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
        />
      {:else if !configStore.reachable}
        <p class="scope" role="alert">
          The bridge is not reachable, so its settings can't be read.
          <button type="button" onclick={() => void configStore.refresh()}>Try again</button>
        </p>
      {:else}
        <p class="scope">Reading the bridge settings…</p>
      {/if}
    </section>

    {#if configStore.active !== null && configStore.saved !== null}
      <section aria-labelledby="playwright-heading">
        <h2 id="playwright-heading">Playwright</h2>
        <p class="scope">
          Saved on the bridge. A change takes effect when the bridge is restarted.
        </p>
        <SettingsForm
          settings={[PLAYWRIGHT_VERSION]}
          active={configStore.active}
          saved={configStore.saved}
          overrides={configStore.overrides}
          {settingContext}
          onSave={(patch: ConfigPatchDto) => configStore.save(patch)}
        />
      </section>
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
