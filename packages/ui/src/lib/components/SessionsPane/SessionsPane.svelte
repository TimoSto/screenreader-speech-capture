<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import type { SessionDto } from '@screenreader-speech-capture/shared';
  import ListItem from '#lib/components/ListItem/ListItem.svelte';
  import { OUTSIDE_SESSIONS, type SessionScope } from '#lib/core/sessions.js';
  import EndSessionDialog from './EndSessionDialog.svelte';
  import SessionRow from './SessionRow.svelte';
  import StartSessionDialog from './StartSessionDialog.svelte';

  type Props = {
    /** Newest first. */
    sessions: SessionDto[];
    currentId: number | null;
    /** Entries in the buffer recorded outside any session. */
    outsideEntries: number;
    /** The session the log shows, or `'none'` for the speech outside any session. */
    selectedId: SessionScope;
    /** Epoch ms, for the duration of the live session. */
    now: number;
    onSelect: (id: SessionScope) => void;
    onStart: (name: string, run: string | null) => Promise<void>;
    onEnd: () => Promise<void>;
  };

  let { sessions, currentId, outsideEntries, selectedId, now, onSelect, onStart, onEnd }: Props =
    $props();

  let startOpen = $state(false);
  let endOpen = $state(false);

  const toggleLabel = $derived(currentId === null ? 'Start a session' : `End session ${currentId}`);

  const entries = $derived(outsideEntries === 1 ? '1 entry' : `${outsideEntries} entries`);
</script>

{#snippet subtitle()}
  <span>{entries}</span>
{/snippet}

<section aria-labelledby="sessions-heading">
  <header>
    <h2 id="sessions-heading">Sessions</h2>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-icon-button
      class={currentId === null ? 'start' : 'stop'}
      title={toggleLabel}
      aria-label={toggleLabel}
      onclick={() => (currentId === null ? (startOpen = true) : (endOpen = true))}
    >
      <md-icon aria-hidden="true">{currentId === null ? 'play_arrow' : 'stop'}</md-icon>
    </md-icon-button>
  </header>

  {#if sessions.length === 0}
    <p class="empty">No sessions in the buffer. Start one with the play button.</p>
  {:else}
    <ul aria-labelledby="sessions-heading">
      {#each sessions as session (session.id)}
        <SessionRow
          {session}
          {now}
          live={session.id === currentId}
          selected={session.id === selectedId}
          onSelect={() => onSelect(session.id)}
        />
      {/each}
    </ul>
  {/if}

  <!-- Pinned below the list: not a session, so it stays out of the newest-first order. Hidden while
       there is nothing to see, unless it is what the log shows (no session is current). -->
  {#if outsideEntries > 0 || selectedId === OUTSIDE_SESSIONS}
    <ul class="outside" aria-label="Outside sessions">
      <ListItem
        title="Outside sessions"
        shape="var(--md-sys-shape-corner-extra-large, 28px)"
        {subtitle}
        selected={selectedId === OUTSIDE_SESSIONS}
        description={`Speech captured while no session was running, ${entries}`}
        onSelect={() => onSelect(OUTSIDE_SESSIONS)}
      />
    </ul>
  {/if}
</section>

<StartSessionDialog open={startOpen} {onStart} onClose={() => (startOpen = false)} />
<EndSessionDialog
  open={endOpen}
  sessionId={currentId}
  entries={sessions.find((session) => session.id === currentId)?.entries ?? null}
  {onEnd}
  onClose={() => (endOpen = false)}
/>

<style>
  section {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 16px 12px;
    border-radius: 28px;
    background: var(--md-sys-color-surface-container-low);
  }

  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 8px 16px;
  }

  h2 {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size, 16px);
    font-weight: 500;
  }

  .start {
    --md-icon-button-icon-color: var(--md-sys-color-primary);
    --md-icon-button-hover-icon-color: var(--md-sys-color-primary);
    --md-icon-button-focus-icon-color: var(--md-sys-color-primary);
  }

  .stop {
    --md-icon-button-icon-color: var(--md-sys-color-error);
    --md-icon-button-hover-icon-color: var(--md-sys-color-error);
    --md-icon-button-focus-icon-color: var(--md-sys-color-error);
  }

  ul {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Not scrollable and not stretched: it sits at the bottom, under the (possibly empty) list. */
  ul.outside {
    flex: none;
    margin-top: auto;
    padding-top: 8px;
    overflow: visible;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }

  .empty {
    margin: 0;
    padding: 8px 16px;
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
