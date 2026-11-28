<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Pane from '#lib/components/Pane/Pane.svelte';
  import TabBar from '#lib/components/TabBar/TabBar.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const tabs = [
    { href: resolve('/setup'), label: 'Check', exact: true },
    { href: resolve('/setup/instructions'), label: 'Instructions' },
  ];
</script>

<Pane heading="Setup">
  <TabBar label="Setup" items={tabs} currentPath={page.url.pathname} />
  {@render children()}
</Pane>
