// The CLI's `--json` output, one schema per command (docs/usage/client.md#cli-for-agents). Scripts
// and agents parse it, so it is a contract like the HTTP API: the commands can only print what these schemas describe.
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

const InputAvailabilityOutput = v.object({
  available: v.boolean(),
  backend: v.pipe(
    v.nullable(v.string()),
    v.description('The library that does it, `null` when not available.'),
  ),
  reason: v.pipe(
    v.nullable(v.string()),
    v.description('Why it is not available, `null` when it is.'),
  ),
});

const bridgeStatusEntries = {
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
  input: v.pipe(
    v.object({
      native: v.pipe(InputAvailabilityOutput, v.description('`press`, `click`.')),
      focus: v.pipe(InputAvailabilityOutput, v.description('`focus` without options.')),
    }),
    v.description('Native input on the bridge. Off: those commands fail with `INPUT_DISABLED`.'),
  ),
};

export const BridgeStatusOutput = v.pipe(
  v.object(bridgeStatusEntries),
  v.description('Bridge health, as `GET /api/v1/status` reports it.'),
);

const TRUNCATED_READ =
  "Some of the speech was dropped because the bridge's buffer was full: this is what is left " +
  '(a warning goes to stderr).';

/** Where `focus --geometry` clicked, in physical pixels. */
const focusPoint = v.pipe(
  v.object({ x: v.pipe(v.number(), v.integer()), y: v.pipe(v.number(), v.integer()) }),
  v.description('The screen point clicked (the middle of the title bar), in physical pixels.'),
);

/** What `press` / `click --capture` add: the speech the action caused. */
const captured = {
  entries: v.pipe(
    v.array(SpeechEntryOutput),
    v.description(
      'With --capture: the speech from just before the action until silence, oldest first. ' +
        'Empty: nothing was said within --first-within ms.',
    ),
  ),
  truncated: v.pipe(v.boolean(), v.description(TRUNCATED_READ)),
  status: v.pipe(
    v.picklist(['silent', 'no-speech', 'timeout']),
    v.description(
      '`silent`: speech came and paused for --quiet-for ms. `no-speech`: nothing was said ' +
        'within --first-within ms (`entries` is empty). `timeout` (exit code 1): the speech went ' +
        'on until --timeout; `entries` is what was said until then. The action has happened in ' +
        'every case.',
    ),
  ),
};

const configKey = v.picklist(Object.keys(CONFIG_KEYS) as (keyof typeof CONFIG_KEYS)[]);
const file = v.pipe(v.string(), v.description('The client config file.'));

export const ConfigValueOutput = v.object({
  key: configKey,
  value: v.pipe(v.string(), v.description('The effective value.')),
  source: v.pipe(
    v.picklist(['explicit', 'env', 'config', 'default']),
    v.description(
      'Where it comes from: the flag (`--url`, `--json`), the environment variable ' +
        '(`SR_SPEECH_URL`, `SR_SPEECH_OUTPUT`), the config file, or the default.',
    ),
  ),
});

const setResult = {
  key: configKey,
  value: v.pipe(v.string(), v.description('The value as saved, normalised.')),
  shadowedBy: v.pipe(
    v.optional(v.literal('env')),
    v.description('Set when the environment variable of the key hides the saved value.'),
  ),
};

/** `timeout` (exit code 1) of `wait` and `wait-silence`: the speech seen while waiting. */
const timedOut = {
  status: v.literal('timeout'),
  entries: v.pipe(v.array(SpeechEntryOutput), v.description('The speech seen while waiting.')),
  truncated: v.pipe(
    v.boolean(),
    v.description(
      "Speech the wait should have looked at was dropped because the bridge's buffer was full.",
    ),
  ),
};

/**
 * Every command's `--json` output, by the command as typed. An expected outcome that isn't
 * success (a wait that timed out) is a result with a `status` and exit code 1, never an error
 * object (docs/usage/client.md#results-and-errors).
 */
export const CLI_OUTPUT = {
  status: v.pipe(
    v.union([
      BridgeStatusOutput,
      v.object({ status: v.literal('ready'), ...bridgeStatusEntries }),
      v.object({
        status: v.literal('not-ready'),
        reason: v.pipe(v.string(), v.description('What the last attempt saw.')),
      }),
    ]),
    v.description(
      'The bridge status. With --wait-ready, it has `status: "ready"`, or `status: "not-ready"` ' +
        '(exit code 1) when the bridge was not ready within --timeout.',
    ),
  ),
  'session start': StartedSessionOutput,
  'session end': v.object({ ended: v.literal(true) }),
  'session delete': v.object({ deleted: v.literal(true) }),
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
    v.variant('status', [
      v.object({ status: v.literal('matched'), entry: SpeechEntryOutput }),
      v.object(timedOut),
    ]),
    v.description('The match, or on timeout (exit code 1) the speech seen.'),
  ),
  'wait-silence': v.pipe(
    v.variant('status', [v.object({ status: v.literal('silent') }), v.object(timedOut)]),
    v.description('Silence, or on timeout (exit code 1) the speech seen.'),
  ),
  mark: SpeechEntryOutput,
  click: v.union([
    v.object({ clicked: v.literal(true) }),
    v.object({ clicked: v.literal(true), ...captured }),
  ]),
  focus: v.union([
    v.object({
      script: v.pipe(
        v.string(),
        v.description("With --script: the function to run with Playwright MCP's browser_evaluate."),
      ),
    }),
    v.object({
      focused: v.literal(true),
      window: v.pipe(
        v.object({ title: v.string(), pid: v.number() }),
        v.description(
          "Without options: Playwright MCP's browser window the bridge brought forward.",
        ),
      ),
    }),
    v.object({ focused: v.literal(true), point: focusPoint }),
    v.object({ focused: v.literal(true), point: focusPoint, ...captured }),
  ]),
  press: v.union([
    v.object({ pressed: v.literal(true) }),
    v.object({ pressed: v.literal(true), ...captured }),
  ]),
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

/**
 * What every command prints with `--json` when it fails (instead of its own output), next to the
 * message on stderr: something went wrong (exit code 2 to 4). A timeout is not an error but a
 * result with `status` (exit code 1).
 */
export const CliErrorOutput = v.pipe(
  v.object({
    error: v.object({
      type: v.pipe(
        v.picklist([
          'UsageError',
          'ClientConfigError',
          'BridgeUnreachableError',
          'BridgeHttpError',
          'IncompatibleBridgeError',
          'InternalError',
        ]),
        v.description(
          'What went wrong; the exit code follows from it. `InternalError` is a bug in the client.',
        ),
      ),
      message: v.string(),
      status: v.pipe(
        v.optional(integer(100)),
        v.description('`BridgeHttpError` only: the HTTP status.'),
      ),
      code: v.pipe(
        v.optional(v.string()),
        v.description(
          '`BridgeHttpError` only: the error code, for example `INPUT_DISABLED`. New codes may appear.',
        ),
      ),
      details: v.pipe(
        v.optional(v.record(v.string(), v.unknown())),
        v.description('`BridgeHttpError` only, if the bridge sent them, for example `field`.'),
      ),
    }),
  }),
  v.description('A failed command (exit code 2 to 4).'),
);

const jsonSchema = v.pipe(v.record(v.string(), v.unknown()), v.description('A JSON Schema.'));

/** `--help --json` (and `<command> --help --json`, with only that command). */
export const HelpOutput = v.object({
  name: v.string(),
  version: v.string(),
  commands: v.array(
    v.object({
      name: v.string(),
      usage: v.array(v.object({ usage: v.string(), description: v.string() })),
      options: v.pipe(
        v.array(v.object({ name: v.string(), type: v.picklist(['string', 'boolean']) })),
        v.description('The options it takes besides the global ones.'),
      ),
      outputs: v.pipe(
        v.record(v.string(), jsonSchema),
        v.description('What it prints with --json, by the command as typed (`session start`).'),
      ),
    }),
  ),
  globalOptions: v.array(v.object({ name: v.string(), flag: v.string(), description: v.string() })),
  error: v.pipe(jsonSchema, v.description('What a failed command prints with --json.')),
  exitCodes: v.record(v.string(), v.number()),
  env: v.pipe(
    v.record(v.string(), v.string()),
    v.description('The environment variables the CLI reads.'),
  ),
});

export type CliError = v.InferOutput<typeof CliErrorOutput>;

export type CliCommand = keyof typeof CLI_OUTPUT;

/** What `command` prints with `--json`. */
export type CliOutput<K extends CliCommand> = v.InferOutput<(typeof CLI_OUTPUT)[K]>;
