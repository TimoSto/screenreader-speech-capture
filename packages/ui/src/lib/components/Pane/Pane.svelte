<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    /** The page's heading, only for screen readers: the sections name themselves. */
    heading: string;
    /** `<section class="part">`s, each with an `<h2>`. */
    children: Snippet;
  };

  let { heading, children }: Props = $props();
</script>

<!-- One pane like the speech log; the page's content is sections in it. -->
<div class="page">
  <div class="pane">
    <h1 class="visually-hidden">{heading}</h1>
    {@render children()}
  </div>
</div>

<style>
  /* The same gutter above and below as the Monitor page, so the pane lines up with the rail. */
  .page {
    box-sizing: border-box;
    height: 100%;
    padding: var(--app-gutter) 0;
  }

  .pane {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 16px 24px 24px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-width: max(1px, var(--app-border-width));
    border-radius: 16px;
    background: var(--md-sys-color-surface-container-lowest);
  }

  .pane > :global(section.part) {
    max-width: 720px;
    margin-top: 24px;
  }

  .pane > :global(section.part + section.part) {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }

  .pane > :global(section.part > h2) {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface);
    font-size: 22px;
    font-weight: 500;
    line-height: 28px;
  }

  /* A paragraph about the page or a section. */
  .pane :global(.scope) {
    margin: 0 0 12px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  @media (max-width: 600px) {
    .pane {
      padding: 12px 12px 16px;
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
