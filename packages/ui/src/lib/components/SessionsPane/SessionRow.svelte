<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import ListItem from '#lib/components/ListItem/ListItem.svelte';
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

{#snippet subtitle()}
  <span class="meta">
    {#if live}<span class="dot"></span>{/if}
    <span>{meta.id}</span>
    {#if meta.run !== null}<span class="run">{meta.run}</span>{/if}
    <span>{meta.duration}</span>
    <span>{meta.entries}</span>
  </span>
{/snippet}

{#snippet stop()}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <md-icon-button
    class="stop"
    title="End session {session.id}"
    aria-label="End session {session.id}"
    onclick={onStop}
  >
    <md-icon aria-hidden="true">stop</md-icon>
  </md-icon-button>
{/snippet}

<!-- Only the live session has an action; the others get no trailing space at all. -->
<ListItem
  title={session.name}
  {subtitle}
  trailing={live ? stop : undefined}
  {selected}
  description={meta.spoken}
  {onSelect}
/>

<style>
  .meta {
    display: flex;
    align-items: center;
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
    --md-icon-button-icon-color: var(--md-sys-color-error);
    --md-icon-button-hover-icon-color: var(--md-sys-color-error);
    --md-icon-button-focus-icon-color: var(--md-sys-color-error);
  }
</style>
