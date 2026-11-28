<script lang="ts">
  import '@material/web/button/outlined-button.js';
  import '@material/web/icon/icon.js';
  import { tick } from 'svelte';
  import ExternalLink from '#lib/components/ExternalLink/ExternalLink.svelte';
  import type { CheckRow, CheckTone } from '#lib/core/setup.js';

  type Props = {
    /** `null` until the status was read once. */
    rows: CheckRow[] | null;
    /** Whether the last read of the status worked. */
    reachable: boolean;
    /** Reads the status again. */
    onCheck: () => Promise<void>;
  };

  let { rows, reachable, onCheck }: Props = $props();

  const ICONS: Record<CheckTone, string> = {
    ok: 'check_circle',
    warning: 'warning',
    neutral: 'radio_button_unchecked',
  };

  /** What the last "Check again" found; empty until someone asks. */
  let result = $state('');

  async function check(): Promise<void> {
    result = '';
    await onCheck();
    await tick();
    if (!reachable) return; // The alert says it.
    const warnings = rows?.filter((row) => row.tone === 'warning').length ?? 0;
    result =
      warnings === 0
        ? 'Checked: no warnings.'
        : `Checked: ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`;
  }
</script>

{#if !reachable}
  <p role="alert" class="unreachable">
    The bridge is not reachable.{rows === null ? '' : ' This is the last state that was read.'}
  </p>
{:else if rows === null}
  <p class="note">Reading the status…</p>
{/if}

{#if rows !== null}
  <ul aria-label="Setup status">
    {#each rows as row (row.id)}
      <li class={row.tone}>
        <md-icon aria-hidden="true">{ICONS[row.tone]}</md-icon>
        <span class="label">{row.label}</span>
        <span class="state">
          {#if row.tone === 'warning'}<span class="visually-hidden">Warning:</span>{/if}
          {row.state}
          {#if row.library !== null}
            {@const { name, href } = row.library}
            <span
              >({#if href === null}{name}{:else}<ExternalLink {href}
                  >{name}<span class="visually-hidden"> on GitHub</span></ExternalLink
                >{/if})</span
            >
          {/if}
          {#if row.help !== null}
            <span class="help"
              ><ExternalLink href={row.help.href}
                >{row.help.label}<span class="visually-hidden">
                  (help for {row.label})</span
                ></ExternalLink
              ></span
            >
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<md-outlined-button type="button" onclick={() => void check()}>
  {reachable ? 'Check again' : 'Try again'}
</md-outlined-button>

<p role="status" class="note">{result}</p>

<style>
  ul {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 24px minmax(0, 180px) minmax(0, 1fr);
    gap: 4px 12px;
    align-items: start;
    padding: 8px 0;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    line-height: 24px;
  }

  li + li {
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }

  .ok md-icon {
    color: var(--app-success);
  }

  .warning md-icon {
    color: var(--app-warning);
  }

  .neutral md-icon {
    color: var(--md-sys-color-on-surface-variant);
  }

  .label {
    font-weight: 500;
  }

  .state {
    overflow-wrap: anywhere;
  }

  .help {
    margin-left: 8px;
  }

  @media (max-width: 600px) {
    li {
      grid-template-columns: 24px minmax(0, 1fr);
    }

    .state {
      grid-column: 2;
    }
  }

  .note,
  .unreachable {
    margin: 0 0 12px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .unreachable {
    color: var(--md-sys-color-error);
    font-size: 14px;
    line-height: 20px;
  }

  p[role='status'] {
    margin: 8px 0 0;
  }

  p[role='status']:empty {
    margin: 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
