<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';

  type Props = {
    open: boolean;
    sessionId: number | null;
    /** Rejects with a message to show; resolves when the session has ended. */
    onEnd: () => Promise<void>;
    onClose: () => void;
  };

  let { open, sessionId, onEnd, onClose }: Props = $props();

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
      await onEnd();
      onClose();
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'The session could not be ended.';
    } finally {
      busy = false;
    }
  }
</script>

<md-dialog {open} onclosed={onClose}>
  <div slot="headline">End session {sessionId === null ? '' : `#${sessionId}`}?</div>
  <div slot="content">
    <p>Speech captured after this belongs to no session.</p>
    {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
  </div>
  <div slot="actions">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" onclick={onClose}>Cancel</md-text-button>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" disabled={busy} onclick={confirm}>End session</md-text-button>
  </div>
</md-dialog>

<style>
  p {
    margin: 0;
  }

  .failure {
    margin-top: 12px;
    color: var(--md-sys-color-error);
  }
</style>
