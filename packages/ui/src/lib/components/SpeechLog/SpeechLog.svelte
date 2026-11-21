<script lang="ts">
  import '@material/web/button/filled-tonal-button.js';
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
  import type { FeedState } from '#lib/core/speech.js';
  import ClearSpeechDialog from './ClearSpeechDialog.svelte';
  import DeleteSessionDialog from './DeleteSessionDialog.svelte';
  import MarkerDialog from './MarkerDialog.svelte';
  import SpeechTable from './SpeechTable.svelte';

  type Props = {
    /** `#3 Checkout flow`, or `Outside sessions`. */
    heading: string;
    /** Oldest first. */
    entries: readonly SpeechEntryDto[];
    connection: FeedState;
    /** Whether a marker added now shows up in this log (see `canAddMarker`). */
    canMark: boolean;
    /** Rejects with a message to show; resolves when the marker is in. */
    onAddMarker: (label: string) => Promise<void>;
    /** Whether the shown scope is an ended session that can be deleted (see `canDeleteSession`). */
    canDelete: boolean;
    /** Whether the shown scope can be cleared: the current session, or the speech outside sessions. */
    canClear: boolean;
    /** Rejects with a message to show; resolves when the speech is cleared. */
    onClear: () => Promise<void>;
    /** Rejects with a message to show; resolves when the session is deleted. */
    onDelete: () => Promise<void>;
  };

  let {
    heading,
    entries,
    connection,
    canMark,
    onAddMarker,
    canDelete,
    onDelete,
    canClear,
    onClear,
  }: Props = $props();

  let markerOpen = $state(false);
  let deleteOpen = $state(false);
  let clearOpen = $state(false);

  /** Scrolled up further than this from the end, the log stops following new rows. */
  const FOLLOW_SLACK_PX = 48;

  let scroller: HTMLElement | undefined = $state();
  let following = $state(true);

  function onScroll(): void {
    if (!scroller) return;
    following =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_SLACK_PX;
  }

  function jumpToLatest(): void {
    following = true;
    scroller?.scrollTo({ top: scroller.scrollHeight });
  }

  // After the new row is in the DOM, stay at the end while following. An empty table is a new
  // scope (or a wipe): start following again.
  $effect(() => {
    if (entries.length === 0) following = true;
    if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
  });
</script>

<section class="log" aria-labelledby="log-heading">
  <header>
    <h1 id="log-heading" class="trunc">{heading}</h1>
    {#if canMark || canClear || canDelete}
      <div role="toolbar" aria-label="Log actions">
        {#if canMark}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <md-icon-button
            title="Add marker"
            aria-label="Add marker"
            onclick={() => (markerOpen = true)}
          >
            <md-icon aria-hidden="true">bookmark_add</md-icon>
          </md-icon-button>
        {/if}
        {#if canClear}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <md-icon-button
            title="Clear speech"
            aria-label="Clear speech"
            disabled={entries.length === 0}
            onclick={() => (clearOpen = true)}
          >
            <md-icon aria-hidden="true">delete_sweep</md-icon>
          </md-icon-button>
        {/if}
        {#if canDelete}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <md-icon-button
            title="Delete session"
            aria-label="Delete session"
            onclick={() => (deleteOpen = true)}
          >
            <md-icon aria-hidden="true">delete</md-icon>
          </md-icon-button>
        {/if}
      </div>
    {/if}
  </header>

  <!-- Focusable so the keyboard can scroll it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="scroll"
    bind:this={scroller}
    onscroll={onScroll}
    role="region"
    aria-label="Speech log"
    aria-live="off"
    tabindex="0"
  >
    <!-- Always there, so its header row doesn't come and go while another scope loads. -->
    <SpeechTable {entries} />
    {#if entries.length === 0}
      <div class="empty">
        <md-icon aria-hidden="true">mic</md-icon>
        {#if connection === 'ended'}
          <p class="title">No entries left</p>
          <p>This session's entries are no longer in the buffer.</p>
        {:else}
          <p class="title">No speech yet</p>
          <p>Make the screen reader speak.</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if connection === 'reconnecting' || connection === 'failed' || !following}
    <footer>
      {#if connection === 'reconnecting'}
        <p role="status" class="mono">Connection lost, reconnecting…</p>
      {:else if connection === 'failed'}
        <p role="alert" class="mono failed">The speech could not be loaded.</p>
      {:else}
        <span></span>
      {/if}
      {#if !following}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <md-filled-tonal-button onclick={jumpToLatest}>
          <md-icon slot="icon" aria-hidden="true">arrow_downward</md-icon>
          Jump to latest
        </md-filled-tonal-button>
      {/if}
    </footer>
  {/if}
</section>

{#if canMark}
  <MarkerDialog open={markerOpen} onAdd={onAddMarker} onClose={() => (markerOpen = false)} />
{/if}

{#if canClear}
  <ClearSpeechDialog open={clearOpen} {heading} {onClear} onClose={() => (clearOpen = false)} />
{/if}

{#if canDelete}
  <DeleteSessionDialog
    open={deleteOpen}
    {heading}
    {onDelete}
    onClose={() => (deleteOpen = false)}
  />
{/if}

<style>
  .log {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 16px;
    background: var(--md-sys-color-surface-container-lowest);
  }

  header {
    box-sizing: border-box;
    flex: none;
    /* The icon button (40px) is only there in some scopes: always reserve its height, so the
       table doesn't jump when the selected session changes. */
    min-height: 64px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 12px 8px 24px;
  }

  h1 {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--md-sys-color-on-surface);
    font-size: 22px;
    font-weight: 500;
    line-height: 28px;
  }

  .trunc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scroll {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* Hidden for a moment: while another scope's rows load there is no point in saying "No speech". */
  .empty {
    animation: reveal 0s 250ms backwards;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 96px 24px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }

  @keyframes reveal {
    from {
      visibility: hidden;
    }
  }

  .empty md-icon {
    --md-icon-size: 40px;
    font-size: 40px;
  }

  .empty p {
    margin: 4px 0 0;
    font-size: 14px;
  }

  .empty .title {
    color: var(--md-sys-color-on-surface);
    font-size: 16px;
    font-weight: 500;
  }

  footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px 8px 24px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface-container-low);
  }

  footer p.failed {
    color: var(--md-sys-color-error);
  }

  footer p {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--app-mono-size);
  }
</style>
