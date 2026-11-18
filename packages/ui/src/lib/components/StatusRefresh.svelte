<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';

  type Props = { loading: boolean; onRetry: () => void };

  let { loading, onRetry }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<!-- md-icon-button wraps a real <button> in its shadow DOM, which handles keys and role. -->
<md-icon-button title="Refresh status" onclick={onRetry}>
  <md-icon class:spin={loading}>refresh</md-icon>
</md-icon-button>

<style>
  md-icon-button {
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
    --md-icon-button-hover-icon-color: var(--md-sys-color-on-surface);
    --md-icon-button-focus-icon-color: var(--md-sys-color-on-surface);
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
