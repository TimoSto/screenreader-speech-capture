<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import StatusChips from '#lib/components/StatusChips/StatusChips.svelte';
  import StatusRefresh from '#lib/components/StatusRefresh/StatusRefresh.svelte';
  import { statusStore } from '#lib/composition.js';
  import { announcement, deriveChips } from '#lib/core/status.js';
  import type { StatusDto } from '@screenreader-speech-capture/shared';

  // The status the server rendered (`+layout.server.ts`); it fills in until the store has its own.
  const seed = $derived(page.data.status as StatusDto | null);
  const status = $derived(statusStore.status ?? seed);
  const chips = $derived(deriveChips(status, statusStore.reachable));

  onMount(() => statusStore.init(seed));
</script>

<StatusChips {chips} announcement={announcement(chips, statusStore.reachable)} />
<StatusRefresh loading={statusStore.loading} onRetry={() => void statusStore.retry()} />
