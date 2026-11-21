<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';

  type Props = {
    open: boolean;
    /** `#3 Checkout flow` */
    heading: string;
    /** Rejects with a message to show; resolves when the speech is cleared. */
    onClear: () => Promise<void>;
    onClose: () => void;
  };

  let { open, heading, onClear, onClose }: Props = $props();

  let failure = $state('');
  let busy = $state(false);

  $effect(() => {
    if (open) failure = '';
  });

  async function confirm(): Promise<void> {
    if (busy) return;
    failure = '';
    busy = true;
    try {
      await onClear();
      onClose();
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'The speech could not be cleared.';
    } finally {
      busy = false;
    }
  }
</script>

<md-dialog {open} onclosed={onClose}>
  <div slot="headline">Clear speech?</div>
  <div slot="content">
    <p>
      The speech of <strong>{heading}</strong> is removed from the bridge. The session keeps running.
      This cannot be undone.
    </p>
    {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
  </div>
  <div slot="actions">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" onclick={onClose}>Cancel</md-text-button>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" disabled={busy} onclick={confirm}>Clear</md-text-button>
  </div>
</md-dialog>

<style>
  md-dialog {
    max-width: min(400px, calc(100% - 48px));
    --md-dialog-container-color: var(--md-sys-color-surface-container-high);
    --md-dialog-headline-color: var(--md-sys-color-on-surface);
    --md-dialog-supporting-text-color: var(--md-sys-color-on-surface-variant);
  }

  p {
    margin: 0;
  }

  .failure {
    margin-top: 12px;
    color: var(--md-sys-color-error);
  }
</style>
