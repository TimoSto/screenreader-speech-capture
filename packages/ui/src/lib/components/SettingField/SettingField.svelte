<script lang="ts">
  import '@material/web/textfield/outlined-text-field.js';
  import type { Setting } from '#lib/core/settings.js';

  type Props = {
    setting: Setting;
    /** What the control holds: the draft, or the saved value. */
    value: string;
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

  let { setting, value, error, fixed, onInput, onSubmit }: Props = $props();
</script>

{#if fixed !== undefined}
  <!-- Text, not a disabled control: Tab skips those, and the value in use is what counts. -->
  <dl>
    <dt>{setting.label}</dt>
    <dd class="value">{fixed.value}</dd>
    <dd class="note">Set by <code>{fixed.by}</code>. Change it where the bridge is started.</dd>
  </dl>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <md-outlined-text-field
    label={setting.label}
    inputmode={setting.control.inputmode}
    autocomplete="off"
    supporting-text={setting.help}
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

<style>
  /* The server's HTML has the field before the browser knows the element: keep its room, so what
     follows doesn't jump. */
  md-outlined-text-field:not(:defined) {
    display: block;
    min-height: 76px;
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
