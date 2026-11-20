<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import favicon from '#lib/assets/favicon.svg';
  import iconFont from '@fontsource/material-symbols-outlined/files/material-symbols-outlined-latin-400-normal.woff2?url';
  import AppHeader from '#lib/components/AppHeader/AppHeader.svelte';
  import NavRail from '#lib/components/NavRail/NavRail.svelte';
  import { markIconFontReady, themeStore } from '#lib/composition.js';
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

  onMount(() => {
    themeStore.init();
    void markIconFontReady();
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="preload" as="font" type="font/woff2" href={iconFont} crossorigin="anonymous" />
  <meta name="color-scheme" content="light dark" />
</svelte:head>

<div class="app">
  <AppHeader host={page.url.host} />

  <div class="body">
    <NavRail items={navItems} currentPath={page.url.pathname} />
    <main>
      {@render children()}
    </main>
  </div>
</div>

<style>
  /* The window height is fixed, so a page can fill what is left below the header (which grows
     when its chips wrap). */
  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }

  .body {
    display: flex;
    flex: 1;
    align-items: stretch;
    min-height: 0;
  }

  main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0 16px;
    overflow: auto;
  }
</style>
