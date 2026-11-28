<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/ripple/ripple.js';
  import { arrowNavigation } from '#lib/components/arrow-navigation.js';
  import { isCurrent, type NavItem } from '#lib/core/navigation.js';

  type Props = { items: NavItem[]; currentPath: string };

  let { items, currentPath }: Props = $props();

  const id = $props.id();

  /** Links only react to Enter by themselves; a navigation rail's items also take Space. */
  function onkeydown(event: KeyboardEvent & { currentTarget: HTMLAnchorElement }) {
    if (event.key !== ' ') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault(); // no scrolling
    if (!event.repeat) event.currentTarget.click();
  }
</script>

<nav aria-label="Pages">
  <ul {@attach arrowNavigation('a')}>
    {#each items as item, index (item.href)}
      {@const current = isCurrent(item, currentPath)}
      {@const linkId = `${id}-link-${index}`}
      {@const labelId = `${linkId}-label`}
      <li>
        <!-- Named by the label alone: from the content, Chromium also reads the icon's
             ligature text ("settings Settings"), despite its aria-hidden. -->
        <!-- The layout passes hrefs it built with resolve(). -->
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a
          id={linkId}
          href={item.href}
          aria-labelledby={labelId}
          aria-current={current ? 'page' : undefined}
          {onkeydown}
        >
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
          <span class="indicator" class:current>
            <!-- Hover and press on the whole link show in the indicator. -->
            <md-ripple for={linkId} aria-hidden="true"></md-ripple>
            <md-icon aria-hidden="true">{item.icon}</md-icon>
          </span>
          <span id={labelId} class="label">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    flex: none;
    width: var(--app-rail-width);
    /* With the links' own 4px, the first icon sits one gutter below the top. */
    padding: calc(var(--app-gutter) - 4px) 0;
    /* Large text in a low window. */
    overflow-y: auto;
    background: var(--md-sys-color-surface);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
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
    /* Room for the focus ring around the icon and the label. */
    padding: 4px 0;
    color: var(--md-sys-color-on-surface-variant);
    text-decoration: none;
  }

  /* Inside the link: the rail is at the window's edge and clips what sticks out. */
  a:focus-visible {
    outline-offset: calc(-1 * var(--md-sys-state-focus-indicator-thickness));
  }

  .indicator {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 32px;
    border: var(--app-border-width) solid transparent;
    box-sizing: border-box;
    border-radius: 16px;
    --md-ripple-hover-color: currentColor;
    --md-ripple-pressed-color: currentColor;
  }

  .indicator.current {
    border-color: var(--md-sys-color-outline);
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  a[aria-current='page'] {
    color: var(--md-sys-color-on-surface);
  }

  /* The whole label stays visible at large text sizes: it wraps and the item grows. */
  .label {
    max-width: 100%;
    text-align: center;
    hyphens: auto;
    overflow-wrap: anywhere;
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-ref-typeface-weight-medium);
  }
</style>
