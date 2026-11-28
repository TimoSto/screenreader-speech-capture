<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    /** An absolute URL of another site: a page in the docs (`docsUrl`) or a repository. */
    href: string;
    children: Snippet;
  };

  let { href, children }: Props = $props();
</script>

<!-- A new tab, so a running check stays. The URL is another site's, so nothing to `resolve`. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a {href} target="_blank" rel="noreferrer">{@render children()}</a>

<style>
  a {
    color: var(--md-sys-color-primary);
  }
</style>
