<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/dialog/dialog.js';
  import '@material/web/textfield/outlined-text-field.js';
  import { API_LIMITS } from '@screenreader-speech-capture/shared';

  type Props = {
    open: boolean;
    /** Rejects with a message to show; resolves when the session has started. */
    onStart: (name: string, run: string | null) => Promise<void>;
    onClose: () => void;
  };

  let { open, onStart, onClose }: Props = $props();

  let name = $state('');
  let run = $state('');
  let nameError = $state('');
  let failure = $state('');
  let busy = $state(false);

  $effect(() => {
    if (open) {
      name = '';
      run = '';
      nameError = '';
      failure = '';
    }
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (trimmedName === '') {
      nameError = 'Enter a name.';
      return;
    }
    nameError = '';
    failure = '';
    busy = true;
    try {
      await onStart(trimmedName, run.trim() === '' ? null : run.trim());
      onClose();
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'The session could not be started.';
    } finally {
      busy = false;
    }
  }
</script>

<md-dialog {open} onclosed={onClose}>
  <div slot="headline">Start a session</div>
  <form slot="content" id="start-session-form" novalidate onsubmit={submit}>
    <md-outlined-text-field
      label="Name"
      required
      maxlength={API_LIMITS.sessionLabelLength}
      value={name}
      error={nameError !== ''}
      error-text={nameError}
      oninput={(event: Event) => (name = (event.target as HTMLInputElement).value)}
    ></md-outlined-text-field>
    <md-outlined-text-field
      label="Run (optional)"
      supporting-text="Groups sessions, for example one run id per test run."
      maxlength={API_LIMITS.sessionLabelLength}
      value={run}
      oninput={(event: Event) => (run = (event.target as HTMLInputElement).value)}
    ></md-outlined-text-field>
    {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
  </form>
  <div slot="actions">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-text-button type="button" onclick={onClose}>Cancel</md-text-button>
    <md-text-button type="submit" form="start-session-form" disabled={busy}>Start</md-text-button>
  </div>
</md-dialog>

<style>
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
