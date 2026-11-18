<script lang="ts">
  import type { Chip } from '#lib/core/status.js';

  type Props = { chips: Chip[]; announcement: string };

  let { chips, announcement }: Props = $props();
</script>

<ul aria-label="Bridge status">
  {#each chips as chip (chip.id)}
    <li class={chip.tone} aria-label={chip.description} title={chip.title}>
      {#if chip.dot !== 'none'}<span class="dot {chip.dot}" aria-hidden="true"></span>{/if}
      <span aria-hidden="true">{chip.text}</span>
    </li>
  {/each}
</ul>
<!-- Only changes of a problem state speak; the regular poll leaves this text as it is. -->
<span class="sr-only" role="status">{announcement}</span>

<style>
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 8px;
    background: var(--md-sys-color-surface-container-lowest, transparent);
    color: var(--md-sys-color-on-surface);
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    white-space: nowrap;
  }

  li.ok {
    --dot: var(--app-success);
  }
  li.warning {
    --dot: var(--app-warning);
    background: var(--app-warning-container);
    color: var(--app-on-warning-container);
    border-color: var(--app-warning);
  }
  li.error {
    --dot: var(--md-sys-color-error);
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
    border-color: var(--md-sys-color-error);
  }
  li.neutral {
    --dot: var(--md-sys-color-outline);
    color: var(--md-sys-color-on-surface-variant);
  }

  .dot {
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
    border: 2px solid var(--dot);
  }
  .dot.hollow {
    background: transparent;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
