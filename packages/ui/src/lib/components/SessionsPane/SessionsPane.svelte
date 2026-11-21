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
    /** Only the header buttons show; the list and the heading are hidden. */
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    onSelect: (id: SessionScope) => void;
    onStart: (name: string, run: string | null) => Promise<void>;
    onEnd: () => Promise<void>;
  };

  let {
    sessions,
    currentId,
    outsideEntries,
    selectedId,
    now,
    collapsed = false,
    onToggleCollapse,
    onSelect,
    onStart,
    onEnd,
  }: Props = $props();

  let startOpen = $state(false);
  let endOpen = $state(false);

  const toggleLabel = $derived(currentId === null ? 'Start a session' : `End session ${currentId}`);

  const collapseLabel = $derived(collapsed ? 'Expand sessions' : 'Collapse sessions');

  const entries = $derived(outsideEntries === 1 ? '1 entry' : `${outsideEntries} entries`);
</script>

{#snippet subtitle()}
  <span>{entries}</span>
{/snippet}

<section aria-labelledby="sessions-heading" class:collapsed>
  <header>
    <!-- First, so it stays where it is when the pane collapses and the buttons stack. -->
    {#if onToggleCollapse}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <md-icon-button
        class="collapse"
        title={collapseLabel}
        aria-label={collapseLabel}
        aria-expanded={!collapsed}
        onclick={onToggleCollapse}
      >
        <md-icon aria-hidden="true">{collapsed ? 'left_panel_open' : 'left_panel_close'}</md-icon>
      </md-icon-button>
    {/if}
    <h2 id="sessions-heading" class:visually-hidden={collapsed}>Sessions</h2>
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

  {#if collapsed}
    <!-- Only the header shows while collapsed. -->
  {:else if sessions.length === 0}
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

  <!-- Pinned below the list: not a session, so it stays out of the newest-first order. Always shown
       while expanded, so it doesn't vanish when a session starts. -->
  {#if !collapsed}
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
    padding: 0 4px 8px 0;
  }

  /* The buttons stack; the section's 12px padding and the 72px strip keep the first one at the
     same x (and y) as when expanded. */
  section.collapsed {
    align-items: flex-start;
  }

  .collapsed header {
    flex-direction: column;
    padding: 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  h2 {
    flex: 1;
    margin: 0 0 0 8px;
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
