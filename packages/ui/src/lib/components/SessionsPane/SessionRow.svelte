<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import '@material/web/ripple/ripple.js';
  import { describeSession } from '#lib/core/sessions.js';
  import type { SessionDto } from '@screenreader-speech-capture/shared';

  type Props = {
    session: SessionDto;
    /** Epoch ms: the end of a live session's duration. */
    now: number;
    selected: boolean;
    live: boolean;
    onSelect: () => void;
    onStop: () => void;
  };

  let { session, now, selected, live, onSelect, onStop }: Props = $props();

  const meta = $derived(describeSession(session, now));
</script>

<li class:selected>
  <!-- One hover and press layer for the whole row, stop button included. -->
  <md-ripple aria-hidden="true"></md-ripple>
  <button
    type="button"
    class="select"
    aria-current={selected ? 'true' : undefined}
    onclick={onSelect}
  >
    <span class="name">{session.name}</span>
    <!-- The sentence below says all of this once; the visual line stays out of the way. -->
    <span class="meta" aria-hidden="true">
      {#if live}<span class="dot"></span>{/if}
      <span>{meta.id}</span>
      {#if meta.run !== null}<span class="run">{meta.run}</span>{/if}
      <span>{meta.duration}</span>
      <span>{meta.entries}</span>
    </span>
    <span class="sr-only">{meta.spoken}</span>
  </button>
  {#if live}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <!-- A sibling of the select button, so no interactive element sits inside another. -->
    <md-icon-button
      class="stop"
      title="End session {session.id}"
      aria-label="End session {session.id}"
      onclick={onStop}
    >
      <md-icon aria-hidden="true">stop</md-icon>
    </md-icon-button>
  {/if}
</li>

<style>
  li {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 60px;
    border-radius: 28px;
    color: var(--md-sys-color-on-surface);
    /* The layer follows the text colour, so it shows on the selected row too. */
    --md-ripple-hover-color: currentColor;
    --md-ripple-pressed-color: currentColor;
  }

  li.selected {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  .select {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    min-width: 0;
    min-height: 60px;
    padding: 8px 16px;
    border: 0;
    border-radius: 28px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    justify-content: center;
  }

  .name {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--md-sys-typescale-label-large-size, 14px);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: center;
    max-width: 100%;
    overflow: hidden;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    white-space: nowrap;
  }

  li.selected .meta {
    color: inherit;
  }

  .meta > :not(:last-child)::after {
    content: '\00a0·\00a0';
  }

  .meta > .dot::after {
    content: none;
  }

  .meta > .run {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--app-success);
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }

  .stop {
    flex: none;
    margin-right: 8px;
    --md-icon-button-icon-color: var(--md-sys-color-error);
    --md-icon-button-hover-icon-color: var(--md-sys-color-error);
    --md-icon-button-focus-icon-color: var(--md-sys-color-error);
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
