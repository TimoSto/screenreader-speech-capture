<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';
  import { CHECK_CHORD } from '#lib/core/setup.js';

  type Props = {
    open: boolean;
    onSend: () => void;
    onClose: () => void;
  };

  let { open, onSend, onClose }: Props = $props();
</script>

<md-dialog {open} onclosed={onClose}>
  <div slot="headline">Send {CHECK_CHORD} during a session?</div>
  <div slot="content">
    <p>
      A session is running. The keys go to the window in front on the bridge's machine, and the
      speech they cause is recorded in that session.
    </p>
  </div>
  <div slot="actions">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" onclick={onClose}>Cancel</md-text-button>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button
      type="button"
      onclick={() => {
        onClose();
        onSend();
      }}
    >
      Send
    </md-text-button>
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
</style>
