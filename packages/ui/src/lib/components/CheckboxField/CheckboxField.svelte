<script lang="ts">
  // A native checkbox, not `md-checkbox`: that passes only its name to the control inside, so the
  // text under it would not be announced with it.
  type Props = {
    path: string;
    label: string;
    checked: boolean;
    /** The text under the checkbox, announced with it. */
    help: string;
    /** Why the value was refused; empty if it wasn't. */
    error: string;
    onChange: (checked: boolean) => void;
  };

  let { path, label, checked, help, error, onChange }: Props = $props();

  const id = $props.id();
</script>

<div>
  <label>
    <input
      type="checkbox"
      data-setting={path}
      {checked}
      aria-describedby={error === '' ? `${id}-help` : `${id}-error ${id}-help`}
      aria-invalid={error === '' ? undefined : true}
      onchange={(event) => onChange(event.currentTarget.checked)}
    />
    <span>{label}</span>
  </label>
  <p class="help" id="{id}-help">{help}</p>
  {#if error !== ''}<p class="error" id="{id}-error" role="alert">{error}</p>{/if}
</div>

<style>
  /* The row leaves 4px under the 20px box: as far as a text field's supporting text is from its
     field. */
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 28px;
    color: var(--md-sys-color-on-surface);
    font-size: 16px;
    line-height: 24px;
    cursor: pointer;
  }

  input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--md-sys-color-primary);
    cursor: pointer;
  }

  input:focus-visible {
    outline: var(--md-sys-state-focus-indicator-thickness) solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  /* Indented like a text field's supporting text. */
  .help,
  .error {
    margin: 0;
    padding: 0 16px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .error {
    color: var(--md-sys-color-error);
  }
</style>
