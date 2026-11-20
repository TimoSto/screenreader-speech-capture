<script lang="ts">
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
  };

  let { session, now, selected, live, onSelect }: Props = $props();

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

<ListItem
  title={session.name}
  shape="var(--md-sys-shape-corner-extra-large, 28px)"
  {subtitle}
  {selected}
  description={meta.spoken}
  {onSelect}
/>

<style>
  /* One line. The run name and then the entry count shrink with an ellipsis; the rest stays whole. */
  .meta {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .meta > span {
    flex: none;
    white-space: nowrap;
  }

  .meta > :not(:last-child)::after {
    content: '\00a0·\00a0';
  }

  .meta > .dot::after {
    content: none;
  }

  .meta > .run,
  .meta > span:last-child {
    flex: 0 1 auto;
    min-width: 0;
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
</style>
