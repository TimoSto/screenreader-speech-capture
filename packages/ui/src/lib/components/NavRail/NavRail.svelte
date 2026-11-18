<script lang="ts">
  import '@material/web/icon/icon.js';
  import { isCurrent, type NavItem } from '#lib/core/navigation.js';

  type Props = { items: NavItem[]; currentPath: string };

  let { items, currentPath }: Props = $props();
</script>

<nav aria-label="Pages">
  <ul>
    {#each items as item (item.href)}
      {@const current = isCurrent(item, currentPath)}
      <li>
        <!-- The layout passes hrefs it built with resolve(). -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={item.href} aria-current={current ? 'page' : undefined}>
          <span class="indicator" class:current><md-icon>{item.icon}</md-icon></span>
          <span class="label">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    flex: none;
    width: var(--app-rail-width);
    padding: 12px 0;
    background: var(--md-sys-color-surface);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    color: var(--md-sys-color-on-surface-variant);
    text-decoration: none;
  }

  .indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 32px;
    border-radius: 16px;
  }

  .indicator.current {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  a:hover .indicator:not(.current) {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  a[aria-current='page'] {
    color: var(--md-sys-color-on-surface);
  }

  .label {
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-ref-typeface-weight-medium);
  }
</style>
