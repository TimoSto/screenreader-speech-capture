<script lang="ts">
  import { isCurrent, type NavItem } from '#lib/core/navigation.js';

  type Props = {
    /** Names the navigation landmark. */
    label: string;
    items: Pick<NavItem, 'href' | 'label' | 'exact'>[];
    currentPath: string;
  };

  let { label, items, currentPath }: Props = $props();
</script>

<!-- Pages that look like tabs: links, so each has its own address and "back" works. -->
<nav aria-label={label}>
  <ul>
    {#each items as item (item.href)}
      <li>
        <!-- The caller passes hrefs it built with resolve(). -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={item.href} aria-current={isCurrent(item, currentPath) ? 'page' : undefined}>
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    border-width: 0 0 max(1px, var(--app-border-width));
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 0 16px;
    /* Always there, so the label doesn't move when the tab becomes the current one. */
    border-bottom: 3px solid transparent;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
  }

  a:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  a[aria-current='page'] {
    border-bottom-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-surface);
  }
</style>
