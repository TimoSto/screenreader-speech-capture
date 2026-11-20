<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/iconbutton/icon-button.js';
  import type { SessionDto } from '@screenreader-speech-capture/shared';
  import EndSessionDialog from './EndSessionDialog.svelte';
  import SessionRow from './SessionRow.svelte';
  import StartSessionDialog from './StartSessionDialog.svelte';

  type Props = {
    /** Newest first. */
    sessions: SessionDto[];
    currentId: number | null;
    selectedId: number | null;
    /** Epoch ms, for the duration of the live session. */
    now: number;
    onSelect: (id: number) => void;
    onStart: (name: string, run: string | null) => Promise<void>;
    onEnd: () => Promise<void>;
  };

  let { sessions, currentId, selectedId, now, onSelect, onStart, onEnd }: Props = $props();

  let startOpen = $state(false);
  let endOpen = $state(false);
</script>

<section aria-labelledby="sessions-heading">
  <header>
    <h2 id="sessions-heading">Sessions</h2>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <md-icon-button
      class="add"
      title="Start a session"
      aria-label="Start a session"
      onclick={() => (startOpen = true)}
    >
      <md-icon aria-hidden="true">add</md-icon>
    </md-icon-button>
  </header>

  {#if sessions.length === 0}
    <p class="empty">No sessions in the buffer. Start one with +.</p>
  {:else}
    <ul aria-labelledby="sessions-heading">
      {#each sessions as session (session.id)}
        <SessionRow
          {session}
          {now}
          live={session.id === currentId}
          selected={session.id === selectedId}
          onSelect={() => onSelect(session.id)}
          onStop={() => (endOpen = true)}
        />
      {/each}
    </ul>
  {/if}
</section>

<StartSessionDialog open={startOpen} {onStart} onClose={() => (startOpen = false)} />
<EndSessionDialog open={endOpen} sessionId={currentId} {onEnd} onClose={() => (endOpen = false)} />

<style>
  section {
    box-sizing: border-box;
    padding: 16px 12px;
    border-radius: 28px;
    background: var(--md-sys-color-surface-container-low);
  }

  header {
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

  .add {
    --md-icon-button-icon-color: var(--md-sys-color-primary);
    --md-icon-button-hover-icon-color: var(--md-sys-color-primary);
    --md-icon-button-focus-icon-color: var(--md-sys-color-primary);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty {
    margin: 0;
    padding: 8px 16px;
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
