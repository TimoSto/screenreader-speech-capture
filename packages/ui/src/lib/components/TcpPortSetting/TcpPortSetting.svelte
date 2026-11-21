<script lang="ts">
  import '@material/web/button/filled-button.js';
  import '@material/web/button/text-button.js';
  import '@material/web/textfield/outlined-text-field.js';
  import { parsePort } from '#lib/core/config.js';

  type Props = {
    /** The port the bridge listens on now. */
    active: number;
    /** The port the next start will use. */
    saved: number;
    /** What sets the port (`--tcp-port`) when a flag or variable does: it can't be changed here. */
    overriddenBy: string | null;
    /** Rejects with a message to show; resolves when the port is saved. */
    onSave: (port: number) => Promise<void>;
  };

  let { active, saved, overriddenBy, onSave }: Props = $props();

  /** What was typed; `null` until the person edits, so the field follows the saved port. */
  let draft = $state<string | null>(null);
  let fieldError = $state('');
  let failure = $state('');
  let busy = $state(false);

  const shown = $derived(draft ?? String(saved));
  const changed = $derived(draft !== null && draft.trim() !== String(saved));
  const pending = $derived(saved !== active);

  function revert(): void {
    draft = null;
    fieldError = '';
    failure = '';
  }

  async function save(): Promise<void> {
    if (busy || !changed) return;
    const parsed = parsePort(shown);
    if (!parsed.ok) {
      fieldError = parsed.message;
      failure = '';
      return;
    }
    fieldError = '';
    failure = '';
    busy = true;
    try {
      await onSave(parsed.port);
      draft = null;
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'The port could not be saved.';
    } finally {
      busy = false;
    }
  }
</script>

<form
  novalidate
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -- a text field, the keydown is for Enter -->
  <md-outlined-text-field
    label="TCP port"
    inputmode="numeric"
    autocomplete="off"
    supporting-text="The port the screen reader's speech voice sends to. Default 4449."
    value={shown}
    disabled={overriddenBy !== null}
    error={fieldError !== ''}
    error-text={fieldError}
    onkeydown={(event: KeyboardEvent) => {
      // Enter saves, whatever the text field does with the form around it.
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void save();
    }}
    oninput={(event: Event) => {
      draft = (event.target as HTMLInputElement).value;
      fieldError = '';
    }}
  ></md-outlined-text-field>

  {#if overriddenBy !== null}
    <p class="note">
      Set by <code>{overriddenBy}</code> when the bridge starts, so a saved port has no effect. Remove
      it to change the port here.
    </p>
  {:else}
    <div class="actions">
      <md-filled-button type="submit" disabled={!changed || busy}>Save</md-filled-button>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <md-text-button type="button" disabled={!changed || busy} onclick={revert}
        >Revert</md-text-button
      >
    </div>
  {/if}

  <p class="note">In use: {active}</p>

  <!-- A live region that is always there, so the notice is announced when it appears. -->
  <div role="status" class="status">
    {#if pending}
      <div class="pending">
        <strong>Restart the bridge to use port {saved}.</strong>
        It still listens on {active} until it is restarted. The speech voice on the VM sends to a fixed
        port, so also add a voice for {saved} (<code>text-to-socket-engine-add-voice</code>) and
        select it in the screen reader.
      </div>
    {/if}
  </div>

  {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 480px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .note {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .pending {
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--app-warning-container);
    color: var(--app-on-warning-container);
    font-size: 14px;
    line-height: 20px;
  }

  .failure {
    margin: 0;
    color: var(--md-sys-color-error);
    font-size: 14px;
    line-height: 20px;
  }

  code {
    font-family: var(--app-mono-font, monospace);
    font-size: 0.95em;
  }
</style>
