<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import SetupStatus from '#lib/components/SetupStatus/SetupStatus.svelte';
  import SpeechTest from '#lib/components/SpeechTest/SpeechTest.svelte';
  import { appStores } from '#lib/composition.js';
  import { deriveCheckRows } from '#lib/core/setup.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const { status: statusStore, voiceCheck } = appStores();

  // On the server the status store is still empty, the layout's load has the status.
  const status = $derived(statusStore.status ?? data.status);
  const rows = $derived(status === null ? null : deriveCheckRows(status));

  onMount(() => {
    // The layout's status is as old as the app's first page; this page is about the current one.
    void statusStore.retry();
    return () => voiceCheck.stop();
  });

  // Speech arrived: the voice row has something new to say.
  $effect(() => {
    if (voiceCheck.phase === 'heard') untrack(() => void statusStore.retry());
  });

  async function isSessionRunning(): Promise<boolean> {
    await statusStore.retry();
    return (statusStore.status ?? data.status)?.session.current != null;
  }
</script>

<svelte:head>
  <title>Setup · Speech Capture</title>
</svelte:head>

<section class="part" aria-labelledby="status-heading">
  <h2 id="status-heading">Status</h2>
  <SetupStatus {rows} reachable={statusStore.reachable} onCheck={() => statusStore.retry()} />
</section>

<section class="part" aria-labelledby="test-heading">
  <h2 id="test-heading">Speech test</h2>
  <SpeechTest
    phase={voiceCheck.phase}
    via={voiceCheck.via}
    entries={voiceCheck.entries}
    reconnecting={voiceCheck.reconnecting}
    failure={voiceCheck.failure}
    local={data.local}
    input={status?.input.native ?? null}
    port={status?.tcp.port ?? null}
    version={status?.bridge.version ?? null}
    onListen={() => void voiceCheck.start('manual')}
    onSendKeys={() => void voiceCheck.start('keys')}
    onStop={() => voiceCheck.stop()}
    {isSessionRunning}
  />
</section>
