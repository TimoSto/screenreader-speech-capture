<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';

  type Props = {
    open: boolean;
    sessionId: number | null;
    /** The session's entry count; the bridge forgets a session that ends with none. */
    entries: number | null;
    /** Rejects with a message to show; resolves when the session has ended. */
    onEnd: () => Promise<void>;
    onClose: () => void;
  };

  let { open, sessionId, entries, onEnd, onClose }: Props = $props();

  const empty = $derived(entries === 0);

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
  <div slot="headline">
    {empty ? 'Drop' : 'End'} session {sessionId === null ? '' : `#${sessionId}`}?
  </div>
  <div slot="content">
    {#if empty}
      <p>This session has no entries, so ending it deletes it. Its number is not reused.</p>
    {:else}
      <p>Speech captured after this belongs to no session.</p>
    {/if}
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
  md-dialog {
    /* The dialog is as wide as its longest line by default; a cap makes the text wrap. */
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
