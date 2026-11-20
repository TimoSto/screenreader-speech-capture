<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import SessionsPane from '#lib/components/SessionsPane/SessionsPane.svelte';
  import { sessionsStore } from '#lib/composition.js';
  import { selectedSessionId } from '#lib/core/sessions.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // Until the store has read the list, show what the server rendered (`+page.server.ts`), so the
  // server's HTML already has the sessions. The store is shared by all requests: it is never
  // filled on the server.
  const list = $derived(
    sessionsStore.loaded
      ? { sessions: sessionsStore.sessions, currentId: sessionsStore.currentId }
      : (data.sessions ?? { sessions: [], currentId: null }),
  );
  const now = $derived(sessionsStore.loaded ? sessionsStore.now : data.now);

  // The URL names the selected session; without it the pane follows the current one.
  const selectedId = $derived(
    selectedSessionId(page.url.searchParams.get('session'), list.sessions, list.currentId),
  );

  onMount(() => sessionsStore.init(data.sessions));

  function select(id: number | null): Promise<void> {
    const live = id === null || id === list.currentId;
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    return goto(live ? resolve('/') : `${resolve('/')}?session=${id}`, { reset: false });
  }

  async function start(name: string, run: string | null): Promise<void> {
    await sessionsStore.start(name, run);
    await select(null); // the new session is current: follow it
  }
</script>

<div class="monitor">
  <aside>
    <SessionsPane
      sessions={list.sessions}
      currentId={list.currentId}
      {selectedId}
      {now}
      onSelect={(id: number) => void select(id)}
      onStart={start}
      onEnd={() => sessionsStore.end()}
    />
  </aside>
  <div class="log">
    <h1>Monitor</h1>
    {#if data.status}
      <p>Bridge {data.status.bridge.version} is {data.status.bridge.state}.</p>
    {:else}
      <p>The bridge is not reachable.</p>
    {/if}
  </div>
</div>

<style>
  .monitor {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  aside {
    flex: none;
    width: 300px;
  }

  .log {
    flex: 1;
    min-width: 0;
  }
</style>
