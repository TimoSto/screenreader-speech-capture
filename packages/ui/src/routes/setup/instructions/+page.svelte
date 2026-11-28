<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import TestMachineInstructions from '#lib/components/TestMachineInstructions/TestMachineInstructions.svelte';
  import VoiceInstructions from '#lib/components/VoiceInstructions/VoiceInstructions.svelte';
  import { appStores } from '#lib/composition.js';
  import {
    bridgeAddress,
    DEFAULT_HTTP_PORT,
    listensOnLoopbackOnly,
  } from '#lib/core/instructions.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const { status: statusStore, clipboard } = appStores();

  // On the server the status store is still empty, the layout's load has the status.
  const status = $derived(statusStore.status ?? data.status);
  const httpPort = $derived(data.http?.port ?? DEFAULT_HTTP_PORT);
  const copy = (text: string) => clipboard.copy(text);

  // The layout's status is as old as the app's first page; the steps use the current values.
  onMount(() => void statusStore.retry());
</script>

<svelte:head>
  <title>Setup instructions · Speech Capture</title>
</svelte:head>

<VoiceInstructions
  tcp={status?.tcp ?? null}
  version={status?.bridge.version ?? null}
  onCopy={copy}
/>

<TestMachineInstructions
  address={bridgeAddress(page.url, httpPort)}
  local={data.local}
  loopbackOnly={data.http !== null && listensOnLoopbackOnly(data.http.host)}
  {httpPort}
  playwright={status?.playwright ?? null}
  mcp={status?.mcp ?? null}
  version={status?.bridge.version ?? null}
  onCopy={copy}
/>
