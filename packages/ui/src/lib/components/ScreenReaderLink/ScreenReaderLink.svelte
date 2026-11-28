<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import { SCREEN_READER_ID } from '#lib/core/setup.js';

  type Props = { children: Snippet };

  let { children }: Props = $props();
</script>

<!-- To the screen reader steps of the Setup instructions. -->
<a href="{resolve('/setup/instructions')}#{SCREEN_READER_ID}">{@render children()}</a>

<style>
  a {
    color: var(--md-sys-color-primary);
  }
</style>
