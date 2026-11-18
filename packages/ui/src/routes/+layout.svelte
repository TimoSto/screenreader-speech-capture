<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import favicon from '#lib/assets/favicon.svg';
  import AppHeader from '#lib/components/AppHeader/AppHeader.svelte';
  import { themeStore } from '#lib/composition.js';
  import '#lib/styles/fonts.css';
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  onMount(() => themeStore.init());
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <meta name="color-scheme" content="light dark" />
</svelte:head>

<AppHeader
  host={page.url.host}
  theme={themeStore.current}
  onToggleTheme={() => themeStore.toggle()}
/>

{@render children()}
