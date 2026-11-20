<script lang="ts">
  import '@material/web/ripple/ripple.js';
  import type { Snippet } from 'svelte';

  type Props = {
    /** One line, cut off with an ellipsis. */
    title: string;
    /** The muted monospace line under the title. */
    subtitle?: Snippet;
    /** Actions at the end of the row. They sit beside the select button, never inside it. */
    trailing?: Snippet;
    /** Highlights the row and sets `aria-current`. */
    selected?: boolean;
    /**
     * What a screen reader should hear instead of the visual subtitle. Without it the subtitle
     * is read as it is.
     */
    description?: string;
    onSelect: () => void;
  };

  let { title, subtitle, trailing, selected = false, description, onSelect }: Props = $props();
</script>

<li class:selected>
  <!-- One hover and press layer for the whole row, trailing actions included. -->
  <md-ripple aria-hidden="true"></md-ripple>
  <button
    type="button"
    class="select"
    aria-current={selected ? 'true' : undefined}
    onclick={onSelect}
  >
    <span class="title">{title}</span>
    {#if subtitle}
      <!-- With a description, the sentence below says all of this once. -->
      <span class="subtitle" aria-hidden={description === undefined ? undefined : 'true'}>
        {@render subtitle()}
      </span>
    {/if}
    {#if description !== undefined}<span class="sr-only">{description}</span>{/if}
  </button>
  {#if trailing}
    <!-- A sibling of the select button, so no interactive element sits inside another. -->
    <span class="trailing">{@render trailing()}</span>
  {/if}
</li>

<style>
  li {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 60px;
    border-radius: 28px;
    color: var(--md-sys-color-on-surface);
    /* The layer follows the text colour, so it shows on the selected row too. */
    --md-ripple-hover-color: currentColor;
    --md-ripple-pressed-color: currentColor;
  }

  li.selected {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  .select {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    min-width: 0;
    min-height: 60px;
    padding: 8px 16px;
    border: 0;
    border-radius: 28px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    justify-content: center;
  }

  .title {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--md-sys-typescale-label-large-size, 14px);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Font, size and colour are inherited by whatever the subtitle snippet renders. */
  .subtitle {
    max-width: 100%;
    overflow: hidden;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    white-space: nowrap;
  }

  li.selected .subtitle {
    color: inherit;
  }

  .trailing {
    display: flex;
    flex: none;
    margin-right: 8px;
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
