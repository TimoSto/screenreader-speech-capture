<script lang="ts">
  import '@material/web/button/filled-button.js';
  import '@material/web/button/text-button.js';
  import { tick } from 'svelte';
  import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
  import SettingField from '#lib/components/SettingField/SettingField.svelte';
  import {
    buildPatch,
    changedSettings,
    explainRejection,
    isPending,
    readSetting,
    type Drafts,
    type Setting,
    type SettingContext,
    type SettingPath,
  } from '#lib/core/settings.js';

  type Props = {
    /** What the form's buttons are about, for their accessible names (`speech capture`). */
    name: string;
    /** In order, one per grid cell; settings that belong together share a cell, stacked. */
    settings: (Setting | Setting[])[];
    /** The configuration in use. */
    active: ConfigDto;
    /** The configuration the next start will use. */
    saved: ConfigDto;
    /** What sets a setting (`--tcp-port`) when a flag or variable does: it can't be changed here. */
    overrides: Readonly<Record<string, string>>;
    settingContext: SettingContext;
    /** Rejects with a message to show; resolves when the patch is saved. */
    onSave: (patch: ConfigPatchDto) => Promise<void>;
  };

  let { name, settings, active, saved, overrides, settingContext, onSave }: Props = $props();

  /** What was typed; a field without a draft follows the saved value. */
  let drafts = $state<Drafts>({});
  let errors = $state<Partial<Record<SettingPath, string>>>({});
  let failure = $state('');
  let busy = $state(false);
  /**
   * Set while the last thing that happened to this form is a save that worked: whether it left
   * something waiting for a restart.
   */
  let justSaved = $state<{ waited: boolean } | null>(null);
  let form: HTMLFormElement;

  const cells = $derived(settings.map((cell) => [cell].flat()));
  const editable = $derived(
    cells.flat().filter((setting) => overrides[setting.path] === undefined),
  );
  const changed = $derived(changedSettings(editable, drafts, saved));
  const idle = $derived(changed.length === 0 || busy);
  const waits = $derived(
    editable.some((setting) => isPending(setting.path, active, saved, overrides)),
  );
  // After the restart there is nothing left to say: the message goes, it doesn't change.
  const savedMessage = $derived.by(() => {
    if (justSaved === null) return '';
    if (!justSaved.waited) return 'Saved.';
    return waits ? 'Saved. Restart the bridge to apply.' : '';
  });

  function revert(): void {
    drafts = {};
    errors = {};
    failure = '';
    justSaved = null;
  }

  async function focusField(path: SettingPath): Promise<void> {
    await tick();
    form.querySelector<HTMLElement>(`[data-setting="${path}"]`)?.focus();
  }

  async function save(): Promise<void> {
    if (busy || changed.length === 0) return;
    const result = buildPatch(editable, drafts, saved);
    failure = '';
    justSaved = null;
    if (!result.ok) {
      errors = result.errors;
      const first = editable.find((setting) => result.errors[setting.path] !== undefined)!;
      await focusField(first.path);
      return;
    }
    errors = {};
    busy = true;
    try {
      await onSave(result.patch);
      drafts = {};
      justSaved = { waited: waits };
    } catch (cause) {
      const rejection = explainRejection(cause, editable);
      if (rejection.field === null) {
        failure = rejection.message;
      } else {
        errors = { [rejection.field]: rejection.message };
        await focusField(rejection.field);
      }
    } finally {
      busy = false;
    }
  }
</script>

<form
  bind:this={form}
  novalidate
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <div class="fields">
    {#each cells as cell (cell[0].path)}
      <div class="cell">
        {#each cell as setting (setting.path)}
          {@const overriddenBy = overrides[setting.path]}
          {@const inUse = readSetting(active, setting.path)}
          <SettingField
            {setting}
            value={drafts[setting.path] ?? setting.format(readSetting(saved, setting.path))}
            savedValue={setting.format(readSetting(saved, setting.path))}
            help={setting.help(inUse, settingContext)}
            pendingValue={isPending(setting.path, active, saved, overrides)
              ? setting.describe(inUse, settingContext)
              : undefined}
            error={errors[setting.path] ?? ''}
            fixed={overriddenBy === undefined
              ? undefined
              : { by: overriddenBy, value: setting.describe(inUse, settingContext) }}
            onInput={(value: string) => {
              drafts[setting.path] = value;
              delete errors[setting.path];
              justSaved = null;
            }}
            onSubmit={() => void save()}
          />
        {/each}
      </div>
    {/each}
  </div>

  {#if editable.length > 0}
    <!-- Soft-disabled: a disabled button would drop the focus it has after a save. -->
    <div class="actions">
      <md-filled-button
        type="submit"
        aria-label="Save {name} settings"
        soft-disabled={idle ? true : undefined}>Save</md-filled-button
      >
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <md-text-button
        type="button"
        aria-label="Revert {name} settings"
        soft-disabled={idle ? true : undefined}
        onclick={revert}>Revert</md-text-button
      >
    </div>
  {/if}

  <!-- A live region that is always there, so the message is announced when it appears. -->
  <p role="status" class="note">{savedMessage}</p>

  {#if failure !== ''}<p role="alert" class="failure">{failure}</p>{/if}
</form>

<style>
  /* Wide enough for two columns of fields, not three. */
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
  }

  /* Two columns when the form has room for them. A column holds the longest option of a select. */
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    align-items: start;
    gap: 12px 24px;
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    max-width: 480px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .note {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .failure {
    margin: 0;
    color: var(--md-sys-color-error);
    font-size: 14px;
    line-height: 20px;
  }
</style>
