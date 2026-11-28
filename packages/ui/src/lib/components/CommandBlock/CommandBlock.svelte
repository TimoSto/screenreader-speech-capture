<script lang="ts">
  import '@material/web/button/text-button.js';
  import '@material/web/icon/icon.js';

  type Props = {
    /** What the block holds, for the button's name: `Copy <label>`. */
    label: string;
    text: string;
    /** Resolves `false` when the browser didn't take it. */
    onCopy: (text: string) => Promise<boolean>;
  };

  let { label, text, onCopy }: Props = $props();

  /** What the last copy did, and of which text: a changed command has not been copied. */
  let copied = $state<{ text: string; ok: boolean } | null>(null);
  const result = $derived(
    copied === null || copied.text !== text
      ? ''
      : copied.ok
        ? 'Copied.'
        : 'Copying failed: select the text and copy it.',
  );

  async function copy(): Promise<void> {
    const wanted = text;
    copied = null; // so a second copy is announced again
    copied = { text: wanted, ok: await onCopy(wanted) };
  }
</script>

<div class="command">
  <pre><code>{text}</code></pre>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <md-text-button type="button" aria-label="Copy {label}" onclick={() => void copy()}>
    <md-icon slot="icon" aria-hidden="true">content_copy</md-icon>
    Copy
  </md-text-button>
</div>
<p role="status">{result}</p>

<style>
  .command {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 4px 8px;
    margin: 0 0 4px;
    padding: 8px 8px 8px 12px;
    border-radius: 12px;
    background: var(--md-sys-color-surface-container-low);
  }

  pre {
    flex: 1 1 320px;
    min-width: 0;
    margin: 0;
    align-self: center;
    color: var(--md-sys-color-on-surface);
    font-family: var(--app-font-mono);
    font-size: var(--app-mono-size);
    line-height: var(--app-mono-line-height);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  code {
    font-family: inherit;
  }

  p {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  p:empty {
    margin: 0 0 4px;
  }
</style>
