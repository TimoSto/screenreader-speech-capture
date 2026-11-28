<script lang="ts">
  import '@material/web/textfield/outlined-text-field.js';
  import type { Setting } from '#lib/core/settings.js';

  type Props = {
    setting: Setting;
    /** What the control holds: the draft, or the saved value. */
    value: string;
    /** Why the value was refused; empty if it wasn't. */
    error: string;
    disabled: boolean;
    onInput: (value: string) => void;
    /** Enter in a text field. */
    onSubmit: () => void;
  };

  let { setting, value, error, disabled, onInput, onSubmit }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<md-outlined-text-field
  label={setting.label}
  inputmode={setting.control.inputmode}
  autocomplete="off"
  supporting-text={setting.help}
  {value}
  {disabled}
  error={error !== ''}
  error-text={error}
  onkeydown={(event: KeyboardEvent) => {
    // Enter saves, whatever the text field does with the form around it.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onSubmit();
  }}
  oninput={(event: Event) => onInput((event.target as HTMLInputElement).value)}
></md-outlined-text-field>
