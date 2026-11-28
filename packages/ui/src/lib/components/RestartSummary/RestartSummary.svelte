<script lang="ts">
  import '@material/web/button/outlined-button.js';
  import { tick } from 'svelte';
  import type { PendingChange } from '#lib/core/settings.js';

  type Props = {
    changes: PendingChange[];
    /** Whether the last read of the configuration worked. */
    reachable: boolean;
    /** Reads the configuration and the status again, after a restart. */
    onCheck: () => Promise<void>;
  };

  let { changes, reachable, onCheck }: Props = $props();

  /** What the last check found; empty until someone checks. */
  let result = $state('');
  let message: HTMLParagraphElement;

  const counted = (count: number) =>
    count === 1 ? '1 change waits for a restart' : `${count} changes wait for a restart`;

  async function check(): Promise<void> {
    result = '';
    await onCheck();
    result = !reachable
      ? 'The bridge is not reachable.'
      : changes.length === 0
        ? 'No changes wait for a restart.'
        : `Checked: ${counted(changes.length)}.`;
    await tick();
    // The button goes away with the last change: keep the focus where the answer is.
    if (changes.length === 0) message.focus();
  }
</script>

{#if changes.length > 0}
  <!-- Not a live region: the form that saved says so, once. -->
  <section aria-labelledby="restart-heading">
    <h2 id="restart-heading">{counted(changes.length)}</h2>
    <ul>
      {#each changes as change (change.path)}
        <li>
          <strong>{change.label}:</strong>
          {change.from} → {change.to}.
          {#each change.consequence as fragment, index (index)}{#if typeof fragment === 'string'}{fragment}{:else}<code
                >{fragment.code}</code
              >{/if}{/each}
        </li>
      {/each}
    </ul>
    <p>Restarting the bridge empties the recorded speech and sessions.</p>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-outlined-button type="button" onclick={() => void check()}>Check again</md-outlined-button>
  </section>
{/if}

<p role="status" tabindex="-1" class="result" bind:this={message}>{result}</p>

<style>
  section {
    box-sizing: border-box;
    max-width: 720px;
    padding: 16px;
    border-radius: 12px;
    background: var(--app-warning-container);
    color: var(--app-on-warning-container);
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  }

  ul {
    margin: 0;
    padding-left: 20px;
  }

  li + li {
    margin-top: 4px;
  }

  p {
    margin: 8px 0;
  }

  /* The button's text and outline in the box's own colour, so it reads in every theme. */
  md-outlined-button {
    --md-outlined-button-label-text-color: var(--app-on-warning-container);
    --md-outlined-button-hover-label-text-color: var(--app-on-warning-container);
    --md-outlined-button-focus-label-text-color: var(--app-on-warning-container);
    --md-outlined-button-pressed-label-text-color: var(--app-on-warning-container);
    --md-outlined-button-outline-color: var(--app-on-warning-container);
  }

  .result {
    margin: 8px 0 0;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .result:empty {
    margin: 0;
  }

  code {
    font-family: var(--app-mono-font, monospace);
    font-size: 0.95em;
  }
</style>
