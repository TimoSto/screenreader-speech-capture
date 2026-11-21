<script lang="ts">
  import type { Theme } from '#lib/core/theme.js';
  import { themeStore } from '#lib/composition.js';
  import ThemeSetting from '#lib/components/ThemeSetting/ThemeSetting.svelte';
</script>

<svelte:head>
  <title>Settings · Speech Capture</title>
</svelte:head>

<!-- One pane like the speech log; every setting is a section in it. The page heading is only for
     screen readers: the sections name themselves. -->
<div class="page">
  <div class="pane">
    <h1 class="visually-hidden">Settings</h1>

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
