<script lang="ts">
  import '@material/web/select/outlined-select.js';
  import '@material/web/select/select-option.js';
  import '@material/web/textfield/outlined-text-field.js';
  import { selectOptions, type Setting } from '#lib/core/settings.js';

  type Props = {
    setting: Setting;
    /** What the control holds: the draft, or the saved value. */
    value: string;
    /** The saved value, as the control holds it. */
    savedValue: string;
    /** The text under the control. */
    help: string;
    /** The value in use while the saved one waits for a restart. */
    pendingValue?: string | undefined;
    /** Why the value was refused; empty if it wasn't. */
    error: string;
    /**
     * Set when a flag or variable sets the setting: it can't be changed here, so the field is a
     * read-only row with the value in use.
     */
    fixed?: { by: string; value: string } | undefined;
    onInput: (value: string) => void;
    /** Enter in a text field. */
    onSubmit: () => void;
  };

  let { setting, value, savedValue, help, pendingValue, error, fixed, onInput, onSubmit }: Props =
    $props();

  // In the supporting text, so a screen reader says it when the field gets the focus.
  const supporting = $derived(
    pendingValue === undefined ? help : `Restart pending, in use: ${pendingValue}. ${help}`,
  );
</script>

{#if fixed !== undefined}
  <!-- Text, not a disabled control: Tab skips those, and the value in use is what counts. -->
  <dl>
    <dt>{setting.label}</dt>
    <dd class="value">{fixed.value}</dd>
    <dd class="note">Set by <code>{fixed.by}</code>. Change it where the bridge is started.</dd>
  </dl>
{:else}
  <div class:pending={pendingValue !== undefined}>
    {#if setting.control.kind === 'select'}
      <md-outlined-select
        data-setting={setting.path}
        label={setting.label}
        supporting-text={supporting}
        {value}
        error={error !== '' ? true : undefined}
        error-text={error}
        onchange={(event: Event) => onInput((event.target as HTMLSelectElement).value)}
      >
        {#each selectOptions(setting.control.options, savedValue) as option (option.value)}
          <md-select-option
            value={option.value}
            selected={option.value === value ? true : undefined}
          >
            <div slot="headline">{option.label}</div>
          </md-select-option>
        {/each}
      </md-outlined-select>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <md-outlined-text-field
        data-setting={setting.path}
        label={setting.label}
        inputmode={setting.control.inputmode}
        suffix-text={setting.control.suffix}
        autocomplete="off"
        supporting-text={supporting}
        {value}
        error={error !== '' ? true : undefined}
        error-text={error}
        onkeydown={(event: KeyboardEvent) => {
          // Enter saves, whatever the text field does with the form around it.
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onSubmit();
        }}
        oninput={(event: Event) => onInput((event.target as HTMLInputElement).value)}
      ></md-outlined-text-field>
    {/if}
  </div>
{/if}

<style>
  /* The server's HTML has the field before the browser knows the element: keep its room, so what
     follows doesn't jump. */
  md-outlined-text-field:not(:defined),
  md-outlined-select:not(:defined) {
    display: block;
    min-height: 76px;
  }

  /* Not a list of every option before the browser knows the select. */
  md-outlined-select:not(:defined) > * {
    display: none;
  }

  md-outlined-text-field,
  md-outlined-select {
    width: 100%;
    min-width: 0;
  }

  .pending {
    padding-left: 12px;
    border-left: 4px solid var(--app-warning);
  }

  dl {
    margin: 0;
  }

  dt,
  .note {
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  dd {
    margin: 0;
  }

  .value {
    margin: 2px 0;
    color: var(--md-sys-color-on-surface);
    font-size: 16px;
    line-height: 24px;
  }

  code {
    font-family: var(--app-mono-font, monospace);
    font-size: 0.95em;
  }
</style>
