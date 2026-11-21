<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import SpeechLog from '#lib/components/SpeechLog/SpeechLog.svelte';
  import SessionsPane from '#lib/components/SessionsPane/SessionsPane.svelte';
  import { sessionsPaneStore, sessionsStore, speechStore } from '#lib/composition.js';
  import { selectedScope, type SessionScope } from '#lib/core/sessions.js';
  import { isLiveScope, logHeading } from '#lib/core/speech.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // Until the store has read the list, show what the server rendered (`+page.server.ts`), so the
  // server's HTML already has the sessions. The store is shared by all requests: it is never
  // filled on the server.
  const list = $derived(
    sessionsStore.loaded
      ? {
          sessions: sessionsStore.sessions,
          currentId: sessionsStore.currentId,
          outsideEntries: sessionsStore.outsideEntries,
        }
      : (data.sessions ?? { sessions: [], currentId: null, outsideEntries: 0 }),
  );
  const now = $derived(sessionsStore.loaded ? sessionsStore.now : data.now);

  // The URL names the selected session (or `none`, the speech outside any session); without it the
  // pane follows the current session, and with no current session it shows the speech outside.
  const selectedId = $derived(
    selectedScope(page.url.searchParams.get('session'), list.sessions, list.currentId),
  );

  const heading = $derived(logHeading(selectedId, list.sessions));

  onMount(() => {
    sessionsPaneStore.init();
    return sessionsStore.init(data.sessions);
  });

  // The log follows the selected scope; it only runs in the browser (effects never run on the
  // server). Whether the scope is live is read once, when it opens: a session that ends while it
  // is shown keeps what it has, and is read as an ended one the next time it is selected.
  $effect(() =>
    speechStore.open(
      selectedId,
      untrack(() => isLiveScope(selectedId, list.currentId)),
    ),
  );

  function select(id: SessionScope | null): Promise<void> {
    // Always spelled out, even for the current session: a clean URL only follows the current
    // session, so it would jump to the speech outside once that session ends.
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    return goto(id === null ? resolve('/') : `${resolve('/')}?session=${id}`, { reset: false });
  }

  async function end(): Promise<void> {
    const ended = list.currentId;
    await sessionsStore.end();
    // A session without entries is dropped by the bridge: don't leave its id in the URL.
    if (ended !== null && !list.sessions.some((session) => session.id === ended)) {
      await select(null);
    }
  }

  async function start(name: string, run: string | null): Promise<void> {
    const started = await sessionsStore.start(name, run);
    await select(started.id); // pinned in the URL, so it stays selected after it ends
  }
</script>

<div class="monitor">
  <aside class:collapsed={sessionsPaneStore.collapsed}>
    <SessionsPane
      collapsed={sessionsPaneStore.collapsed}
      onToggleCollapse={() => sessionsPaneStore.toggle()}
      sessions={list.sessions}
      currentId={list.currentId}
      outsideEntries={list.outsideEntries}
      {selectedId}
      {now}
      onSelect={(id: SessionScope) => void select(id)}
      onStart={start}
      onEnd={end}
    />
  </aside>
  <div class="log">
    <SpeechLog {heading} entries={speechStore.entries} connection={speechStore.connection} />
  </div>
</div>

<style>
  /* The same gap above as below, and the one the rail keeps above its active item, so the pane
     starts level with it. */
  .monitor {
    display: flex;
    gap: 16px;
    align-items: stretch;
    height: 100%;
    padding: var(--app-gutter) 0;
  }

  aside {
    flex: none;
    width: var(--app-sessions-width);
    min-height: 0;
    transition: width 200ms ease;
  }

  aside.collapsed {
    width: var(--app-sessions-collapsed-width);
  }

  @media (prefers-reduced-motion: reduce) {
    aside {
      transition: none;
    }
  }

  .log {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
</style>
