<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import favicon from '#lib/assets/favicon.svg';
  import AppHeader from '#lib/components/AppHeader/AppHeader.svelte';
  import NavRail from '#lib/components/NavRail/NavRail.svelte';
  import { themeStore } from '#lib/composition.js';
  import type { NavItem } from '#lib/core/navigation.js';
  import '#lib/styles/fonts.css';
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const navItems: NavItem[] = [
    { href: resolve('/'), label: 'Monitor', icon: 'monitor', exact: true },
    { href: resolve('/settings'), label: 'Settings', icon: 'settings' },
    { href: resolve('/setup'), label: 'Setup', icon: 'build' },
  ];

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

<div class="body">
  <NavRail items={navItems} currentPath={page.url.pathname} />
  <main>
    {@render children()}
  </main>
</div>

<style>
  .body {
    display: flex;
    align-items: flex-start;
  }

  main {
    flex: 1;
    min-width: 0;
    padding: 0 16px;
  }
</style>
