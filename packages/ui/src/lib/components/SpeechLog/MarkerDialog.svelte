<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';
  import '@material/web/textfield/outlined-text-field.js';
  import { API_LIMITS } from '@screenreader-speech-capture/shared';

  type Props = {
    open: boolean;
    /** Rejects with a message to show; resolves when the marker is in. */
    onAdd: (label: string) => Promise<void>;
    onClose: () => void;
  };

  let { open, onAdd, onClose }: Props = $props();

  let label = $state('');
  let labelError = $state('');
  let failure = $state('');
  let busy = $state(false);

  $effect(() => {
    if (open) {
      label = '';
      labelError = '';
      failure = '';
    }
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const trimmed = label.trim();
    if (trimmed === '') {
      labelError = 'Enter a label.';
      return;
    }
    labelError = '';
    failure = '';
    busy = true;
    try {
      await onAdd(trimmed);
      onClose();
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'The marker could not be added.';
    } finally {
      busy = false;
    }
  }
</script>

<md-dialog {open} onclosed={onClose}>
  <div slot="headline">Add a marker</div>
  <form slot="content" id="add-marker-form" novalidate onsubmit={submit}>
    <md-outlined-text-field
      label="Label"
      required
      maxlength={API_LIMITS.markerLength}
      supporting-text="Shows in the log as a row of its own, for example “step 3”."
      value={label}
      error={labelError !== ''}
      error-text={labelError}
      oninput={(event: Event) => (label = (event.target as HTMLInputElement).value)}
    ></md-outlined-text-field>
    {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
  </form>
  <div slot="actions">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" onclick={onClose}>Cancel</md-text-button>
    <md-text-button type="submit" form="add-marker-form" disabled={busy}>Add</md-text-button>
  </div>
</md-dialog>

<style>
  md-dialog {
    --md-dialog-container-color: var(--md-sys-color-surface-container-high);
    --md-dialog-headline-color: var(--md-sys-color-on-surface);
    --md-dialog-supporting-text-color: var(--md-sys-color-on-surface-variant);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: min(360px, 70vw);
  }

  .failure {
    margin: 0;
    color: var(--md-sys-color-error);
  }
</style>
