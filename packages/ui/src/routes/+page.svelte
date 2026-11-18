<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<h1>Monitor</h1>
{#if data.status}
  <p>Bridge {data.status.bridge.version} is {data.status.bridge.state}.</p>
{:else}
  <p>The bridge is not reachable.</p>
{/if}
