<script lang="ts">
  import '@material/web/icon/icon.js';
  import '@material/web/ripple/ripple.js';
  import type { Snippet } from 'svelte';

  type Props = {
    /** One line, cut off with an ellipsis. */
    title: string;
    /** The muted monospace line under the title. */
    subtitle?: Snippet;
    /** Highlights the row, shows an eye and sets `aria-selected`. */
    selected?: boolean;
    /**
     * What a screen reader should hear instead of the visual subtitle. Without it the subtitle
     * is read as it is.
     */
    description?: string;
    /**
     * The row's corner radius as a CSS value. Defaults to 8px, the radius of md-list-item's
     * focus ring (md-list-item itself has no container shape).
     */
    shape?: string;
    onSelect: () => void;
  };

  let { title, subtitle, selected = false, description, shape, onSelect }: Props = $props();

  const id = $props.id();
  const titleId = `${id}-title`;
  const textId = `${id}-text`;
</script>

<!-- An option of the caller's listbox, which handles the arrow keys. A button, so Enter and Space
     select it. Named by its texts alone: the icon's ligature text stays out. -->
<button
  type="button"
  role="option"
  class="option"
  class:selected
  style:--list-item-shape={shape}
  aria-selected={selected}
  aria-labelledby={subtitle || description !== undefined ? `${titleId} ${textId}` : titleId}
  onclick={onSelect}
>
  <md-ripple aria-hidden="true"></md-ripple>
  <!-- Selection without colour. The room is always there, so the text doesn't move. -->
  <span class="marker">
    {#if selected}<md-icon aria-hidden="true">visibility</md-icon>{/if}
  </span>
  <span class="text">
    <span id={titleId} class="title">{title}</span>
    {#if subtitle}
      <!-- With a description, the sentence below says all of this once. -->
      <span
        id={description === undefined ? textId : undefined}
        class="subtitle"
        aria-hidden={description === undefined ? undefined : 'true'}
      >
        {@render subtitle()}
      </span>
    {/if}
    {#if description !== undefined}<span id={textId} class="sr-only">{description}</span>{/if}
  </span>
</button>

<style>
  .option {
    position: relative;
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-height: 60px;
    padding: 8px 16px 8px 12px;
    border: 0;
    border-radius: var(--list-item-shape, var(--md-sys-shape-corner-small, 8px));
    background: transparent;
    color: var(--md-sys-color-on-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
    /* The layer follows the text colour, so it shows on the selected row too. */
    --md-ripple-hover-color: currentColor;
    --md-ripple-pressed-color: currentColor;
  }

  .option.selected {
    outline: var(--app-border-width) solid var(--md-sys-color-outline);
    outline-offset: calc(var(--app-border-width) * -1);
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  /* Inside the row: a scrolling list clips what sticks out. After .selected, whose outline it
     replaces. */
  .option:focus-visible,
  .option.selected:focus-visible {
    outline: var(--md-sys-state-focus-indicator-thickness) solid var(--md-sys-color-secondary);
    outline-offset: calc(-1 * var(--md-sys-state-focus-indicator-thickness));
  }

  .marker {
    display: flex;
    flex: none;
    width: 24px;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title {
    overflow: hidden;
    font-size: var(--md-sys-typescale-label-large-size, 14px);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Font, size and colour are inherited by whatever the subtitle snippet renders. */
  .subtitle {
    overflow: hidden;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    white-space: nowrap;
  }

  .selected .subtitle {
    color: inherit;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
