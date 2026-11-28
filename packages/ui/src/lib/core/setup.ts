import type {
  InputAvailabilityDto,
  ServiceStatusDto,
  SpeechEntryDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import type { FeedState } from './speech.js';

/** The keys of the check: "read the window title" in NVDA and JAWS. */
export const CHECK_CHORD = 'Insert+T';
/** The marker in front of the check's keys, so the speech they cause is told apart. */
export const CHECK_MARKER = `ui: ${CHECK_CHORD}`;
/** How long the check waits for speech someone makes by hand. */
export const LISTEN_TIMEOUT_MS = 30_000;
/** How long it waits for speech after it sent the keys. */
export const KEYS_TIMEOUT_MS = 5000;
/** After the first speech, the check collects what follows until nothing came for this long. */
export const QUIET_MS = 1000;
/** Most entries the check shows. */
export const MAX_HEARD = 5;

/** `manual`: someone makes the screen reader speak. `keys`: the check sends {@link CHECK_CHORD}. */
export type CheckVia = 'manual' | 'keys';

export type SpeechProbeHandlers = {
  /** Speech entries and markers, in `seq` order. */
  onEntry(entry: SpeechEntryDto): void;
  /** `failed`: the stream is gone for good. */
  onState(state: Extract<FeedState, 'live' | 'reconnecting' | 'failed'>): void;
};

/** All speech after a point, whichever session it belongs to. */
export interface SpeechProbe {
  /** Follows the entries with `seq > since`; the returned function stops it. */
  listen(since: number, handlers: SpeechProbeHandlers): () => void;
}

/** Native key presses on the bridge's machine, through the BFF. */
export interface KeysApi {
  /** One chord such as `Insert+T`. Rejects with the bridge's message. */
  press(keys: string): Promise<void>;
}

const DOCS_URL = 'https://github.com/TimoSto/screenreader-speech-capture/blob';

/**
 * A page of `docs/` on GitHub, as of the bridge's release. Only stable releases are tagged, so a
 * preview, a development build and an unknown version read `main`.
 */
export function docsUrl(version: string | null, path: string): string {
  const released = version !== null && /^\d+\.\d+\.\d+$/.test(version);
  const ref = released ? `screenreader-speech-capture@${version}` : 'main';
  return `${DOCS_URL}/${ref}/docs/${path}`;
}

/** Where the libraries behind a feature live, by the `backend` name the bridge reports. */
const LIBRARY_REPOS = new Map([
  ['robotjs', 'https://github.com/jitsi/robotjs'],
  ['koffi', 'https://github.com/Koromix/koffi'],
]);

export type CheckRowId = 'listener' | 'voice' | 'input' | 'focus' | 'playwright' | 'mcp';
/** `neutral`: nothing wrong, but nothing to confirm either (yet). */
export type CheckTone = 'ok' | 'warning' | 'neutral';

export type CheckRow = {
  id: CheckRowId;
  label: string;
  tone: CheckTone;
  /** The state in words, so it is never colour or icon alone. */
  state: string;
  /** The library that provides the feature; `href` is `null` for one without a known repository. */
  library: { name: string; href: string | null } | null;
  /** Where to read on, for a row that isn't ok. */
  help: { label: string; href: string } | null;
};

/** What the bridge itself knows about the setup, one row each. */
export function deriveCheckRows(status: StatusDto): CheckRow[] {
  const link = (label: string, path: string) => ({
    label,
    href: docsUrl(status.bridge.version, path),
  });
  const row = (
    id: CheckRowId,
    label: string,
    tone: CheckTone,
    state: string,
    help: { label: string; path: string },
    library: CheckRow['library'] = null,
  ): CheckRow => ({
    id,
    label,
    tone,
    state,
    library,
    help: tone === 'ok' ? null : link(help.label, help.path),
  });

  const { listening, port, encoding, connections } = status.tcp;
  const voices = [...new Set(connections.flatMap(({ voice }) => (voice === null ? [] : [voice])))];
  const count = connections.length === 1 ? '1 connection' : `${connections.length} connections`;

  const input = (
    id: CheckRowId,
    label: string,
    { available, backend, reason }: InputAvailabilityDto,
    help: { label: string; path: string },
  ) =>
    row(
      id,
      label,
      available ? 'ok' : 'warning',
      available ? 'Available' : `Not available: ${reason ?? 'no reason given'}`,
      help,
      backend === null ? null : { name: backend, href: LIBRARY_REPOS.get(backend) ?? null },
    );

  const service = (id: CheckRowId, label: string, { state, version }: ServiceStatusDto) => {
    const [tone, words]: [CheckTone, string] = {
      running: ['ok', `Running, version ${version}`],
      starting: ['neutral', `Starting, version ${version}`],
      stopped: ['neutral', 'Off'],
      crashed: ['warning', `Crashed, version ${version}. It restarts by itself.`],
      failed: ['warning', `Failed, version ${version}`],
    }[state] as [CheckTone, string];
    return row(id, label, tone, words, {
      label: 'Child services',
      path: 'usage/operations.md#child-service-crashes',
    });
  };

  return [
    row(
      'listener',
      'Speech listener',
      listening ? 'ok' : 'warning',
      listening ? `Listening on port ${port} (${encoding})` : `Not listening on port ${port}`,
      { label: 'Troubleshooting', path: 'usage/troubleshooting.md#speech' },
    ),
    row(
      'voice',
      'Voice connected',
      connections.length > 0 ? 'ok' : 'neutral',
      connections.length > 0
        ? `${count}${voices.length > 0 ? ` (voice ${voices.join(', ')})` : ''}`
        : 'None yet: the voice connects with its first words',
      { label: 'Select the voice', path: 'usage/vm-setup.md#screen-reader-setup' },
    ),
    input('input', 'Native input', status.input.native, {
      label: 'Troubleshooting',
      path: 'usage/troubleshooting.md#browser-and-input',
    }),
    input('focus', 'Window focus', status.input.focus, {
      label: 'Bringing the browser to the front',
      path: 'usage/native-input.md#bringing-the-browser-to-the-front',
    }),
    service('playwright', 'Playwright server', status.playwright),
    service('mcp', 'Playwright MCP', status.mcp),
  ];
}
