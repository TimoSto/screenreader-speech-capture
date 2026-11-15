<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<main>
  <h1>Screenreader speech capture</h1>
  <p>Bridge {data.status.bridge.version} is {data.status.bridge.state}.</p>
</main>
