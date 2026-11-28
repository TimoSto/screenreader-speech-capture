<script lang="ts">
  import '@material/web/button/filled-button.js';
  import '@material/web/button/text-button.js';
  import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
  import SettingField from '#lib/components/SettingField/SettingField.svelte';
  import {
    buildPatch,
    changedSettings,
    readSetting,
    type Drafts,
    type Setting,
    type SettingContext,
    type SettingPath,
  } from '#lib/core/settings.js';

  type Props = {
    settings: Setting[];
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

  let { settings, active, saved, overrides, settingContext, onSave }: Props = $props();

  /** What was typed; a field without a draft follows the saved value. */
  let drafts = $state<Drafts>({});
  let errors = $state<Partial<Record<SettingPath, string>>>({});
  let failure = $state('');
  let busy = $state(false);

  const editable = $derived(settings.filter((setting) => overrides[setting.path] === undefined));
  const changed = $derived(changedSettings(editable, drafts, saved));
  const pending = $derived(
    editable.filter(
      (setting) => readSetting(saved, setting.path) !== readSetting(active, setting.path),
    ),
  );

  function revert(): void {
    drafts = {};
    errors = {};
    failure = '';
  }

  async function save(): Promise<void> {
    if (busy || changed.length === 0) return;
    const noun = changed[0].noun;
    const result = buildPatch(editable, drafts, saved);
    failure = '';
    if (!result.ok) {
      errors = result.errors;
      return;
    }
    errors = {};
    busy = true;
    try {
      await onSave(result.patch);
      drafts = {};
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
  {#each settings as setting (setting.path)}
    {@const overriddenBy = overrides[setting.path]}
    <SettingField
      {setting}
      value={drafts[setting.path] ?? setting.format(readSetting(saved, setting.path))}
      error={errors[setting.path] ?? ''}
      fixed={overriddenBy === undefined
        ? undefined
        : {
            by: overriddenBy,
            value: setting.describe(readSetting(active, setting.path), settingContext),
          }}
      onInput={(value: string) => {
        drafts[setting.path] = value;
        delete errors[setting.path];
      }}
      onSubmit={() => void save()}
    />
  {/each}

  {#if editable.length > 0}
    <div class="actions">
      <md-filled-button type="submit" disabled={changed.length === 0 || busy}>Save</md-filled-button
      >
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <md-text-button type="button" disabled={changed.length === 0 || busy} onclick={revert}
        >Revert</md-text-button
      >
    </div>
  {/if}

  {#each editable as setting (setting.path)}
    <p class="note">
      In use: {setting.describe(readSetting(active, setting.path), settingContext)}
    </p>
  {/each}

  <!-- A live region that is always there, so the notice is announced when it appears. -->
  <div role="status" class="status">
    {#each pending as setting (setting.path)}
      {@const notice = setting.notice(
        readSetting(saved, setting.path),
        readSetting(active, setting.path),
        settingContext,
      )}
      <div class="pending">
        <strong>{notice.headline}</strong>
        {#each notice.detail as fragment, index (index)}{#if typeof fragment === 'string'}{fragment}{:else}<code
              >{fragment.code}</code
            >{/if}{/each}
      </div>
    {/each}
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
