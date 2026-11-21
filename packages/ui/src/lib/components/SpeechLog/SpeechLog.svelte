<script lang="ts">
  import '@material/web/button/filled-tonal-button.js';
  import '@material/web/icon/icon.js';
  import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
  import type { FeedState } from '#lib/core/speech.js';
  import SpeechTable from './SpeechTable.svelte';

  type Props = {
    /** `#3 Checkout flow`, or `Outside sessions`. */
    heading: string;
    /** Oldest first. */
    entries: readonly SpeechEntryDto[];
    connection: FeedState;
  };

  let { heading, entries, connection }: Props = $props();

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

  // After the new row is in the DOM, stay at the end while following.
  $effect(() => {
    void entries.length;
    if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
  });
</script>

<section class="log" aria-labelledby="log-heading">
  <header>
    <h1 id="log-heading" class="trunc">{heading}</h1>
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
    {:else}
      <SpeechTable {entries} />
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
    flex: none;
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

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 96px 24px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
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
