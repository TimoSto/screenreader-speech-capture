<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import favicon from '#lib/assets/favicon.svg';
  import AppHeader from '#lib/components/AppHeader/AppHeader.svelte';
  import { statusStore, themeStore } from '#lib/composition.js';
  import { announcement, deriveChips } from '#lib/core/status.js';
  import '#lib/styles/fonts.css';
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // The server-rendered status fills in until the store has its own answer.
  const status = $derived(statusStore.status ?? data.status);
  const chips = $derived(deriveChips(status, statusStore.reachable));

  onMount(() => {
    themeStore.init();
    statusStore.init(data.status);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <meta name="color-scheme" content="light dark" />
</svelte:head>

<AppHeader
  host={page.url.host}
  {chips}
  announcement={announcement(chips, statusStore.reachable)}
  loading={statusStore.loading}
  onRetry={() => void statusStore.retry()}
  theme={themeStore.current}
  onToggleTheme={() => themeStore.toggle()}
/>

{@render children()}
