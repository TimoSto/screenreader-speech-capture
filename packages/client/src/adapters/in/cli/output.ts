// The CLI's `--json` output, one schema per command (docs/client.md#cli-for-agents). Scripts and
// agents parse it, so it is a contract like the HTTP API: `pnpm cli-schema` publishes it as
// docs/cli-output.schema.json, and the commands can only print what these schemas describe.
import * as v from 'valibot';
import { CONFIG_KEYS } from '../../../domain/client-config.js';

const integer = (min: number) => v.pipe(v.number(), v.integer(), v.minValue(min));
const nullableInteger = (min: number) => v.nullable(integer(min));
const timestamp = (text: string) => v.pipe(v.string(), v.description(text));

export const SpeechEntryOutput = v.pipe(
  v.object({
    seq: v.pipe(
      integer(1),
      v.description(
        "The entry's ID. Rises with every entry, survives a clear and keeps rising across bridge " +
          'restarts. `--since` takes it.',
      ),
    ),
    kind: v.picklist(['speech', 'marker']),
    text: v.pipe(v.string(), v.description("What was spoken, or the marker's label.")),
    receivedAt: timestamp("ISO 8601, UTC, on the bridge's clock."),
    source: v.pipe(
      v.picklist(['tcp', 'api']),
      v.description('`tcp` for speech, `api` for markers.'),
    ),
    voice: v.pipe(
      v.nullable(v.string()),
      v.description(
        'Header (`voice=<id>`) of the sending voice, `null` if not set or for markers.',
      ),
    ),
    connectionId: v.pipe(
      nullableInteger(1),
      v.description('TCP connection that delivered it, `null` for markers.'),
    ),
    sessionId: v.pipe(
      nullableInteger(1),
      v.description('The session that was current when it was recorded, `null` outside any.'),
    ),
  }),
  v.description('One recorded speech entry or marker.'),
);

const sessionEntries = {
  id: v.pipe(integer(1), v.description('Increasing, restarts at 1 with the bridge.')),
  name: v.string(),
  run: v.pipe(v.nullable(v.string()), v.description('Optional label that groups sessions.')),
  client: v.pipe(
    v.nullable(v.string()),
    v.description('The client that started it, `null` if unknown.'),
  ),
  startedAt: timestamp("ISO 8601, UTC, on the bridge's clock."),
  endedAt: v.pipe(
    v.nullable(v.string()),
    v.description('ISO 8601, UTC. `null` while the session is current.'),
  ),
  startSeq: v.pipe(
    integer(0),
    v.description('The last `seq` before the session started: `--since <startSeq>` reads it.'),
  ),
  firstSeq: v.pipe(nullableInteger(1), v.description('First entry still in the buffer.')),
  lastSeq: v.pipe(nullableInteger(1), v.description('Last entry still in the buffer.')),
  entries: v.pipe(integer(0), v.description('Entries of this session still in the buffer.')),
};

export const SessionOutput = v.pipe(
  v.object(sessionEntries),
  v.description('The speech of one test or agent task.'),
);

export const StartedSessionOutput = v.object({
  ...sessionEntries,
  replaced: v.pipe(
    v.nullable(SessionOutput),
    v.description(
      'The session this start ended, if another client had started it (two clients share one ' +
        'screen reader), `null` otherwise.',
    ),
  ),
});

export const SessionListOutput = v.object({
  sessions: v.pipe(
    v.array(SessionOutput),
    v.description('The current session and the ended ones still in the buffer, newest first.'),
  ),
  currentId: v.pipe(nullableInteger(1), v.description('`null` when no session is current.')),
});

const ServiceStatusOutput = v.object({
  state: v.picklist(['stopped', 'starting', 'running', 'crashed', 'failed']),
  version: v.string(),
  port: integer(0),
  restarts: v.pipe(
    integer(0),
    v.description('Restarts after crashes since the service was last started.'),
  ),
  exitCode: v.pipe(
    v.nullable(v.pipe(v.number(), v.integer())),
    v.description('Exit code of the last unexpected exit, `null` if none or killed by a signal.'),
  ),
});

export const BridgeStatusOutput = v.pipe(
  v.object({
    bridge: v.object({
      version: v.string(),
      apiVersion: v.pipe(v.string(), v.description('`<major>.<minor>` of the HTTP API.')),
      state: v.picklist(['starting', 'ready', 'stopping']),
      startedAt: timestamp('ISO 8601, UTC. When this bridge run started.'),
    }),
    tcp: v.object({
      listening: v.boolean(),
      host: v.string(),
      port: integer(0),
      encoding: v.string(),
      connections: v.array(
        v.object({ id: integer(1), voice: v.nullable(v.string()), connectedAt: v.string() }),
      ),
    }),
    buffer: v.object({
      size: integer(0),
      maxEntries: integer(1),
      firstSeq: nullableInteger(1),
      lastSeq: nullableInteger(1),
    }),
    playwright: ServiceStatusOutput,
    mcp: ServiceStatusOutput,
    session: v.object({ current: v.nullable(SessionOutput), count: integer(0) }),
  }),
  v.description('Bridge health, as `GET /api/v1/status` reports it.'),
);

const TRUNCATED_READ =
  "Some of the speech was dropped because the bridge's buffer was full: this is what is left " +
  '(a warning goes to stderr).';

const configKey = v.picklist(Object.keys(CONFIG_KEYS) as (keyof typeof CONFIG_KEYS)[]);
const file = v.pipe(v.string(), v.description('The client config file.'));

export const ConfigValueOutput = v.object({
  key: configKey,
  value: v.pipe(v.string(), v.description('The effective value.')),
  source: v.pipe(
    v.picklist(['explicit', 'env', 'config', 'default']),
    v.description(
      'Where it comes from: `--url`, `SR_SPEECH_URL`, the config file, or the default.',
    ),
  ),
});

const setResult = {
  key: configKey,
  value: v.pipe(v.string(), v.description('The value as saved, normalised.')),
  shadowedBy: v.pipe(
    v.optional(v.literal('env')),
    v.description('Set when `SR_SPEECH_URL` hides the saved value.'),
  ),
};

/** Every command's `--json` output, by the command as typed. */
export const CLI_OUTPUT = {
  status: BridgeStatusOutput,
  'session start': StartedSessionOutput,
  'session end': v.object({ ended: v.literal(true) }),
  'session list': SessionListOutput,
  clear: v.object({ cleared: v.literal(true) }),
  speech: v.object({
    entries: v.array(SpeechEntryOutput),
    truncated: v.pipe(v.boolean(), v.description(TRUNCATED_READ)),
  }),
  text: v.object({
    text: v.pipe(v.string(), v.description('The speech, joined.')),
    truncated: v.pipe(v.boolean(), v.description(TRUNCATED_READ)),
  }),
  wait: v.pipe(
    v.variant('matched', [
      v.object({ matched: v.literal(true), entry: SpeechEntryOutput }),
      v.object({
        matched: v.literal(false),
        entries: v.pipe(
          v.array(SpeechEntryOutput),
          v.description('The speech seen while waiting.'),
        ),
        truncated: v.pipe(
          v.boolean(),
          v.description(
            "Speech the wait should have looked at was dropped because the bridge's buffer was full.",
          ),
        ),
      }),
    ]),
    v.description('The match, or on timeout (exit code 1) the speech seen.'),
  ),
  'wait-silence': v.object({ silent: v.literal(true) }),
  mark: SpeechEntryOutput,
  tail: v.pipe(
    v.variant('type', [
      v.object({ type: v.literal('entry'), entry: SpeechEntryOutput }),
      v.object({ type: v.literal('session'), session: SessionOutput }),
      v.object({ type: v.literal('clear') }),
      v.object({ type: v.literal('truncated') }),
    ]),
    v.description('One line per event, as it happens (NDJSON).'),
  ),
  'config set': v.object({ ...setResult, file }),
  'config get': ConfigValueOutput,
  'config unset': v.object({ key: configKey, file }),
  'config list': v.object({ file, settings: v.array(ConfigValueOutput) }),
  'config path': v.object({ file }),
} as const;

export type CliCommand = keyof typeof CLI_OUTPUT;

/** What `command` prints with `--json`. */
export type CliOutput<K extends CliCommand> = v.InferOutput<(typeof CLI_OUTPUT)[K]>;
