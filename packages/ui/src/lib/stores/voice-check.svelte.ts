import {
  CHECK_CHORD,
  CHECK_MARKER,
  KEYS_TIMEOUT_MS,
  LISTEN_TIMEOUT_MS,
  MAX_HEARD,
  QUIET_MS,
  type CheckVia,
  type KeysApi,
  type SpeechProbe,
} from '#lib/core/setup.js';
import type { SpeechApi } from '#lib/core/speech.js';
import type { StatusApi } from '#lib/core/status.js';
import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';

export type CheckPhase = 'idle' | 'starting' | 'listening' | 'heard' | 'silent' | 'failed';

/** The speech test of the Setup page: does speech reach the bridge? */
export function createVoiceCheckStore(
  statusApi: StatusApi,
  probe: SpeechProbe,
  keysApi: KeysApi,
  speechApi: Pick<SpeechApi, 'addMarker'>,
) {
  let phase = $state<CheckPhase>('idle');
  let via = $state<CheckVia>('manual');
  let entries = $state.raw<SpeechEntryDto[]>([]);
  let reconnecting = $state(false);
  let failure = $state('');

  /** Counts the runs: whatever answers for an earlier one is ignored. */
  let run = 0;
  let close: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Ends the current run: its stream, its timer and every answer still to come. */
  function finish(): void {
    run++;
    clearTimeout(timer);
    close?.();
    close = null;
    reconnecting = false;
  }

  function fail(message: string): void {
    finish();
    phase = 'failed';
    failure = message;
  }

  /** Gives up after `ms`. A lost connection is a failure, not silence. */
  function giveUpAfter(ms: number): void {
    timer = setTimeout(() => {
      if (reconnecting) {
        fail('The connection to the bridge was lost.');
        return;
      }
      finish();
      phase = 'silent';
    }, ms);
  }

  return {
    get phase() {
      return phase;
    },
    get via() {
      return via;
    },
    /** The speech that arrived, oldest first. */
    get entries() {
      return entries;
    },
    get reconnecting() {
      return reconnecting;
    },
    /** Why the check failed. */
    get failure() {
      return failure;
    },

    /**
     * Waits for new speech. With `keys` it also sends {@link CHECK_CHORD}, after a marker, and
     * only counts the speech after that marker. Replaces a run that is still going.
     */
    async start(how: CheckVia): Promise<void> {
      finish();
      const mine = run;
      via = how;
      phase = 'starting';
      entries = [];
      failure = '';

      let since: number;
      try {
        since = (await statusApi.fetch()).buffer.lastSeq ?? 0;
      } catch {
        if (mine === run) fail('The bridge is not reachable.');
        return;
      }
      if (mine !== run) return;

      let counting = how === 'manual';
      phase = 'listening';
      close = probe.listen(since, {
        onEntry(entry) {
          if (mine !== run) return;
          if (entry.kind === 'marker') {
            if (entry.text === CHECK_MARKER) counting = true;
            return;
          }
          if (!counting) return;
          entries = [...entries, entry];
          phase = 'heard';
          clearTimeout(timer);
          if (entries.length >= MAX_HEARD) finish();
          else timer = setTimeout(finish, QUIET_MS);
        },
        onState(state) {
          if (mine !== run) return;
          if (state !== 'failed') reconnecting = state === 'reconnecting';
          else if (phase === 'heard') finish();
          else fail('The speech stream is not available.');
        },
      });

      if (how === 'manual') {
        giveUpAfter(LISTEN_TIMEOUT_MS);
        return;
      }
      try {
        // The replay from `since` brings the marker and the speech, however fast they are.
        await speechApi.addMarker(CHECK_MARKER);
        if (mine !== run) return;
        await keysApi.press(CHECK_CHORD);
      } catch (cause) {
        // Speech that already arrived stays the answer.
        if (mine === run && entries.length === 0) {
          fail(cause instanceof Error ? cause.message : 'The keys could not be sent.');
        }
        return;
      }
      if (mine === run && entries.length === 0) giveUpAfter(KEYS_TIMEOUT_MS);
    },

    /** Stops listening and forgets the result. */
    stop(): void {
      finish();
      phase = 'idle';
      entries = [];
      failure = '';
    },
  };
}
