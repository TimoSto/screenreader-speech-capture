<script lang="ts">
  import '@material/web/button/filled-button.js';
  import '@material/web/button/outlined-button.js';
  import '@material/web/button/text-button.js';
  import { resolve } from '$app/paths';
  import type { InputAvailabilityDto, SpeechEntryDto } from '@screenreader-speech-capture/shared';
  import ExternalLink from '#lib/components/ExternalLink/ExternalLink.svelte';
  import { CHECK_CHORD, docsUrl, type CheckVia } from '#lib/core/setup.js';
  import type { CheckPhase } from '#lib/stores/voice-check.svelte.js';
  import SendKeysDialog from './SendKeysDialog.svelte';

  type Props = {
    phase: CheckPhase;
    via: CheckVia;
    /** The speech that arrived, oldest first. */
    entries: readonly SpeechEntryDto[];
    reconnecting: boolean;
    failure: string;
    /**
     * The page is opened on the screen reader's own machine: the screen reader reads it, so what
     * arrived is hidden from it, and the page's own speech can pass the check.
     */
    local: boolean;
    /** Whether the bridge can send keys; `null` until the status was read. */
    input: InputAvailabilityDto | null;
    /** The port the bridge listens on for speech, and its version; `null` until known. */
    port: number | null;
    version: string | null;
    onListen: () => void;
    onSendKeys: () => void;
    onStop: () => void;
    /** Read right before the keys are sent: they need a confirmation while a session runs. */
    isSessionRunning: () => Promise<boolean>;
  };

  let {
    phase,
    via,
    entries,
    reconnecting,
    failure,
    local,
    input,
    port,
    version,
    onListen,
    onSendKeys,
    onStop,
    isSessionRunning,
  }: Props = $props();

  let confirmOpen = $state(false);
  let asking = $state(false);

  const busy = $derived(phase === 'starting' || phase === 'listening');
  const cannotSend = $derived(busy || input?.available !== true);

  const progress = $derived(
    !busy
      ? ''
      : reconnecting
        ? 'Connection lost, reconnecting…'
        : via === 'keys'
          ? `Sending ${CHECK_CHORD} and waiting for speech…`
          : 'Listening. Make the screen reader speak, for example with a key press.',
  );
  const outcome = $derived(
    phase === 'heard'
      ? 'Speech arrived.'
      : phase === 'silent'
        ? 'Nothing arrived.'
        : phase === 'failed'
          ? `The check failed: ${failure}`
          : '',
  );
  // On the bridge's machine the progress is not announced: its speech would pass the check.
  const announced = $derived(outcome !== '' ? outcome : local ? '' : progress);

  async function send(): Promise<void> {
    if (cannotSend || asking) return;
    asking = true;
    try {
      if (await isSessionRunning()) confirmOpen = true;
      else onSendKeys();
    } finally {
      asking = false;
    }
  }
</script>

<p class="scope">
  Checks that what the screen reader says reaches the bridge. Listen and make it speak, or let the
  bridge send {CHECK_CHORD} (read the window title in NVDA and JAWS) to the window in front.
</p>
{#if local}
  <p class="scope">
    This page is opened on the bridge's own machine: the screen reader reads this page too, and that
    speech can pass the check.
  </p>
{/if}

<!-- Soft-disabled: a disabled button would drop the focus it has after a click. -->
<div class="actions">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <md-filled-button
    type="button"
    soft-disabled={busy ? true : undefined}
    onclick={() => {
      if (!busy) onListen();
    }}>Listen</md-filled-button
  >
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <md-outlined-button
    type="button"
    soft-disabled={cannotSend ? true : undefined}
    onclick={() => void send()}>Send {CHECK_CHORD}</md-outlined-button
  >
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <md-text-button
    type="button"
    soft-disabled={busy ? undefined : true}
    onclick={() => {
      if (busy) onStop();
    }}>Stop</md-text-button
  >
</div>

{#if input !== null && !input.available}
  <p class="scope">
    {CHECK_CHORD} can't be sent: {input.reason ?? 'native input is not available'}
  </p>
{/if}

{#if local && progress !== ''}<p class="result">{progress}</p>{/if}
<!-- A live region that is always there. It says how it went, never what was spoken. -->
<p role="status" class="result {phase}">{announced}</p>

{#if phase === 'heard'}
  <ol aria-label="Speech that arrived" aria-hidden={local ? 'true' : undefined}>
    {#each entries as entry (entry.seq)}
      <li>{entry.text}</li>
    {/each}
  </ol>
  <p class="scope">
    Wrong characters? Set the <a href={resolve('/settings')}>text encoding</a>.
  </p>
{:else if phase === 'silent' && via === 'manual'}
  <ul class="hints">
    <li>
      <ExternalLink href={docsUrl(version, 'usage/vm-setup.md#screen-reader-setup')}
        >Select the socket voice</ExternalLink
      > in the screen reader.
    </li>
    <li>
      The voice must send to {port === null ? "the bridge's port" : `port ${port}`}
      (<ExternalLink href={docsUrl(version, 'usage/troubleshooting.md#speech')}
        >troubleshooting</ExternalLink
      >).
    </li>
    <li>
      JAWS: turn off
      <ExternalLink href={docsUrl(version, 'usage/vm-setup.md#jaws-language-detection')}
        >Detect Language Changes</ExternalLink
      >.
    </li>
  </ul>
{:else if phase === 'silent'}
  <p class="scope">
    {CHECK_CHORD} was sent. Use Listen and make the screen reader speak by hand: if that works, the keys
    don't reach the screen reader (<ExternalLink
      href={docsUrl(version, 'usage/troubleshooting.md#browser-and-input')}
      >troubleshooting</ExternalLink
    >).
  </p>
{/if}

<SendKeysDialog open={confirmOpen} onSend={onSendKeys} onClose={() => (confirmOpen = false)} />

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .result {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .result:empty {
    margin: 0;
  }

  .result.heard {
    color: var(--app-success);
    font-weight: 500;
  }

  .result.failed {
    color: var(--md-sys-color-error);
  }

  ol {
    margin: 0 0 12px;
    padding: 8px 12px 8px 36px;
    border-radius: 12px;
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    font-size: var(--app-log-text-size);
    line-height: var(--app-log-text-line-height);
    overflow-wrap: anywhere;
  }

  .hints {
    margin: 0;
    padding-left: 20px;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    line-height: 20px;
  }

  .hints li + li {
    margin-top: 4px;
  }

  /* The link to the settings; the doc links style themselves. */
  p a {
    color: var(--md-sys-color-primary);
  }
</style>
