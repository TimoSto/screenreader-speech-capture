<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import BridgeStatus from '#lib/components/BridgeStatus/BridgeStatus.svelte';

  type Props = {
    host: string;
  };

  let { host }: Props = $props();
</script>

<header>
  <div class="logo-slot">
    <div class="logo">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2" /></svg
      >
    </div>
  </div>
  <div class="title">
    <span class="name">Speech Capture</span>
    <span class="meta">{host}</span>
  </div>
  <BridgeStatus />
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px 16px;
    min-height: 68px;
    padding: 10px 16px 10px 0;
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface);
  }

  /* As wide as the navigation rail, so the logo sits centered over it. */
  .logo-slot {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--app-rail-width);
  }

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }

  .title {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }

  header {
    flex-wrap: wrap;
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
