<script lang="ts">
  import '@material/web/icon/icon.js';
  import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
  import { formatReceivedTime } from '#lib/core/speech.js';

  type Props = {
    /** Oldest first. */
    entries: readonly SpeechEntryDto[];
  };

  let { entries }: Props = $props();

  /** A row that arrived this recently gets the tint that fades out (see `--app-new-row-ms`). */
  const FRESH_MS = 2000;
  const fresh = (entry: SpeechEntryDto): boolean =>
    Date.now() - Date.parse(entry.receivedAt) < FRESH_MS;
</script>

<table aria-label="Speech">
  <thead>
    <tr>
      <th scope="col">Received</th>
      <th scope="col">Spoken text</th>
      <th scope="col" class="seq">Seq</th>
    </tr>
  </thead>
  <tbody>
    {#each entries as entry (entry.seq)}
      <tr class:fresh={fresh(entry)} class:marker={entry.kind === 'marker'}>
        <td class="time mono">{formatReceivedTime(entry.receivedAt)}</td>
        <td class="text">
          {#if entry.kind === 'marker'}
            <span class="pill" title={entry.text}>
              <md-icon aria-hidden="true">bookmark</md-icon>
              <span class="visually-hidden">Marker: </span>
              <span class="label mono">{entry.text}</span>
            </span>
          {:else}
            {entry.text}
          {/if}
        </td>
        <td class="seq mono">#{entry.seq}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    /* `collapse` would leave the borders of the sticky header behind when scrolling. */
    border-collapse: separate;
    border-spacing: 0;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 6px 12px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface-variant);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-align: left;
    text-transform: uppercase;
  }

  thead th:first-child {
    padding-left: 24px;
  }

  th.seq,
  td.seq {
    padding-right: 24px;
    text-align: left;
  }

  tbody tr:hover {
    background: var(--md-sys-color-surface-container);
  }

  td {
    padding: 7px 12px;
    vertical-align: baseline;
  }

  /* Time and seq are as wide as their text (seq is a 13-digit number); the text takes the rest. */
  td.time,
  td.seq {
    width: 1%;
    white-space: nowrap;
  }

  td.time {
    padding-left: 24px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--app-mono-size);
    line-height: var(--app-mono-line-height);
  }

  td.text {
    color: var(--md-sys-color-on-surface);
    font-size: var(--app-log-text-size);
    line-height: var(--app-log-text-line-height);
    overflow-wrap: anywhere;
  }

  td.seq {
    color: var(--md-sys-color-outline);
    font-size: 11px;
  }

  tr.fresh {
    animation: fade-new calc(var(--app-new-row-ms) * 1ms) ease-out;
  }

  /* High-contrast themes: a left edge marks the new row too (the tint alone is a weak cue). */
  tr.fresh td:first-child {
    animation: fade-new-edge calc(var(--app-new-row-ms) * 1ms) ease-out;
  }

  @keyframes fade-new {
    from {
      background: var(--app-new-row);
    }
  }

  @keyframes fade-new-edge {
    from {
      box-shadow: inset calc(var(--app-border-width) * 2) 0 0 var(--md-sys-color-primary);
    }
  }

  /* In a narrow log the sequence number is the first thing to go (the log pane is the container). */
  @container (max-width: 520px) {
    th.seq,
    td.seq {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    tr.fresh {
      animation: none;
    }
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 70%;
    height: 24px;
    padding: 0 8px 0 4px;
    border-radius: 6px;
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    vertical-align: middle;
  }

  .pill md-icon {
    --md-icon-size: 16px;
    font-size: 16px;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
