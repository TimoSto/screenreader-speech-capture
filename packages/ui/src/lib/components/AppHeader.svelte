<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import type { Theme } from '#lib/core/theme.js';

  type Props = {
    host: string;
    bridge: { version: string; apiVersion: string; state: string };
    theme: Theme;
    onToggleTheme: () => void;
  };

  let { host, bridge, theme, onToggleTheme }: Props = $props();

  const label = $derived(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
</script>

<header>
  <div class="title">
    <span class="name">Speech Capture</span>
    <span class="meta"
      >{host} · bridge {bridge.version} · API {bridge.apiVersion} · {bridge.state}</span
    >
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <!-- md-icon-button wraps a real <button> in its shadow DOM, which handles keys and role. -->
  <md-icon-button aria-label={label} title={label} onclick={onToggleTheme}>
    <md-icon>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</md-icon>
  </md-icon-button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px 16px;
    min-height: 68px;
    padding: 10px 16px;
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface);
  }

  .title {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }

  .name {
    font-family: var(--md-sys-typescale-title-large-font);
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
    font-weight: var(--md-ref-typeface-weight-medium);
  }

  .meta {
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    line-height: var(--app-mono-line-height);
    color: var(--md-sys-color-on-surface-variant);
  }

  md-icon-button {
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
    --md-icon-button-hover-icon-color: var(--md-sys-color-on-surface);
    --md-icon-button-focus-icon-color: var(--md-sys-color-on-surface);
    --md-icon-button-pressed-icon-color: var(--md-sys-color-on-surface);
  }
</style>
