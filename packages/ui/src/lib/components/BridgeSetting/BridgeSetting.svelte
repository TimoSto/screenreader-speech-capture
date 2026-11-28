<script lang="ts" generics="T">
  import '@material/web/button/filled-button.js';
  import '@material/web/button/text-button.js';
  import '@material/web/textfield/outlined-text-field.js';
  import type { Snippet } from 'svelte';

  type Props = {
    label: string;
    /** What the messages call the value (`port`). */
    noun: string;
    /** The text under the field. */
    helpText: string;
    inputmode?: 'text' | 'numeric';
    /** The value the next start will use. */
    saved: T;
    /** The value in use now. */
    active: T;
    /** What sets the value (`--tcp-port`) when a flag or variable does: it can't be changed here. */
    overriddenBy: string | null;
    /** A value as the field shows it. */
    format: (value: T) => string;
    /** Reads what was typed; a refused text shows its message and is not saved. */
    parse: (text: string) => { ok: true; value: T } | { ok: false; message: string };
    /** The value in use, in words. */
    inUse: string;
    /** What to do while the saved value differs from the one in use. */
    notice: Snippet;
    /** Rejects with a message to show; resolves when the value is saved. */
    onSave: (value: T) => Promise<void>;
  };

  let {
    label,
    noun,
    helpText,
    inputmode = 'text',
    saved,
    active,
    overriddenBy,
    format,
    parse,
    inUse,
    notice,
    onSave,
  }: Props = $props();

  /** What was typed; `null` until the person edits, so the field follows the saved value. */
  let draft = $state<string | null>(null);
  let fieldError = $state('');
  let failure = $state('');
  let busy = $state(false);

  const shown = $derived(draft ?? format(saved));
  const changed = $derived(draft !== null && draft.trim() !== format(saved));
  const pending = $derived(saved !== active);

  function revert(): void {
    draft = null;
    fieldError = '';
    failure = '';
  }

  async function save(): Promise<void> {
    if (busy || !changed) return;
    const parsed = parse(shown);
    if (!parsed.ok) {
      fieldError = parsed.message;
      failure = '';
      return;
    }
    fieldError = '';
    failure = '';
    busy = true;
    try {
      await onSave(parsed.value);
      draft = null;
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : `The ${noun} could not be saved.`;
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <md-outlined-text-field
    {label}
    {inputmode}
    autocomplete="off"
    supporting-text={helpText}
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
      Set by <code>{overriddenBy}</code> when the bridge starts, so a saved {noun} has no effect. Remove
      it to change the {noun} here.
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

  <p class="note">In use: {inUse}</p>

  <!-- A live region that is always there, so the notice is announced when it appears. -->
  <div role="status" class="status">
    {#if pending}
      <div class="pending">
        {@render notice()}
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
