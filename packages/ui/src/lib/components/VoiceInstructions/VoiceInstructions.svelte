<script lang="ts">
  import CommandBlock from '#lib/components/CommandBlock/CommandBlock.svelte';
  import ExternalLink from '#lib/components/ExternalLink/ExternalLink.svelte';
  import { DEFAULT_TCP_PORT, INSTALL_VOICE, voiceSetup } from '#lib/core/instructions.js';
  import { docsUrl, SCREEN_READER_ID } from '#lib/core/setup.js';

  type Props = {
    /** Where the bridge listens for speech; `null` until known (the defaults are shown). */
    tcp: { host: string; port: number } | null;
    version: string | null;
    onCopy: (text: string) => Promise<boolean>;
  };

  let { tcp, version, onCopy }: Props = $props();

  const voice = $derived(voiceSetup(tcp ?? { host: '127.0.0.1', port: DEFAULT_TCP_PORT }));
  const docs = (path: string) => docsUrl(version, path);
</script>

<section class="part" aria-labelledby="voice-heading">
  <h2 id="voice-heading">Socket voice</h2>
  <p>On the bridge's machine, in an <strong>administrator</strong> prompt:</p>
  <CommandBlock label="the install commands" text={INSTALL_VOICE} {onCopy} />
  {#if voice.addVoice !== null}
    <p>
      The default voice doesn't send to where this bridge listens. Add a voice that does, in the
      same prompt:
    </p>
    <CommandBlock label="the add-voice command" text={voice.addVoice} {onCopy} />
  {/if}
  <ul class="more">
    <li>
      <ExternalLink href={docs('usage/troubleshooting.md#speech')}>
        The voice is not listed
      </ExternalLink>
    </li>
    <li>
      <ExternalLink href={docs('usage/vm-setup.md#more-voices--other-ports')}>
        More voices, and removing them
      </ExternalLink>
    </li>
  </ul>
</section>

<section class="part" aria-labelledby={SCREEN_READER_ID}>
  <!-- Focusable: the check's links jump here. -->
  <h2 id={SCREEN_READER_ID} tabindex="-1">Screen reader</h2>
  <p>Select the voice <strong>{voice.name}</strong>.</p>

  <h3>NVDA</h3>
  <ol>
    <li>Open the NVDA menu (NVDA+N) → Preferences → Settings… → Speech.</li>
    <li>Under Synthesizer, choose Change… → Microsoft Speech API version 5 → OK.</li>
    <li>Under Voice, select {voice.name}.</li>
  </ol>

  <h3>JAWS</h3>
  <ol>
    <li>Open JAWS → Options → Voices → Voice Adjustment….</li>
    <li>
      Create or select a voice profile and set its Synthesizer to SAPI 5 (the label can differ
      between JAWS versions).
    </li>
    <li>Select {voice.name} as the Voice, apply it to all contexts and save the profile.</li>
    <li>
      In Settings Center (Insert+F2), turn off <em>Detect Language Changes</em> (German:
      <em lang="de">Sprachwechsel erkennen</em>), or web pages are read by another voice.
    </li>
  </ol>

  <ul class="more">
    <li>
      <ExternalLink href={docs('usage/vm-setup.md#a-german-voice')}>
        JAWS in German or another language doesn't list the voice
      </ExternalLink>
    </li>
    <li>
      <ExternalLink href={docs('usage/vm-setup.md#prepare-the-vm')}>
        Prepare the VM for CI
      </ExternalLink>
    </li>
    <li>
      <ExternalLink href={docs('usage/vm-setup.md#screen-reader-licensing')}>
        Screen reader licensing
      </ExternalLink>
    </li>
  </ul>
</section>

<style>
  p,
  ol,
  .more {
    margin: 0 0 8px;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 16px 0 4px;
    color: var(--md-sys-color-on-surface);
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  }

  ol,
  .more {
    padding-left: 20px;
  }

  li + li {
    margin-top: 4px;
  }

  .more {
    margin: 16px 0 0;
  }
</style>
