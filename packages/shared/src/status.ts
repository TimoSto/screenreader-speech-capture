import * as v from 'valibot';
import { SessionSchema } from './session.js';

const integer = (min: number) => v.pipe(v.number(), v.integer(), v.minValue(min));
const timestamp = v.pipe(v.string(), v.isoTimestamp());

export const BRIDGE_STATES = ['starting', 'ready', 'stopping'] as const;
export type BridgeState = (typeof BRIDGE_STATES)[number];

export const ServiceStatusSchema = v.pipe(
  v.object({
    state: v.pipe(
      v.picklist(['stopped', 'starting', 'running', 'crashed', 'failed']),
      v.description(
        '`starting` includes the install. `crashed`: it exited and restarts after a delay. ' +
          "`failed`: 5 crashes in a row; restart the bridge (or change the service's settings).",
      ),
    ),
    version: v.pipe(
      v.string(),
      v.description('The version that runs (configured or bundled).'),
      v.examples(['1.65.0']),
    ),
    port: integer(0),
    restarts: v.pipe(
      integer(0),
      v.description(
        'Restarts after crashes since the service was last started (bridge start or config change).',
      ),
    ),
    exitCode: v.pipe(
      v.nullable(v.pipe(v.number(), v.integer())),
      v.description(
        'Exit code of the last unexpected exit. `null` if none, or killed by a signal.',
      ),
    ),
  }),
  v.description('A child service (docs/usage/operations.md#child-service-crashes).'),
);

export type ServiceStatusDto = v.InferOutput<typeof ServiceStatusSchema>;

const ConnectionSchema = v.object({
  id: integer(1),
  voice: v.nullable(v.string()),
  connectedAt: timestamp,
});

export type ConnectionDto = v.InferOutput<typeof ConnectionSchema>;

export const StatusSchema = v.pipe(
  v.object({
    bridge: v.object({
      version: v.pipe(
        v.string(),
        v.description('Package version of the bridge.'),
        v.examples(['0.3.0']),
      ),
      apiVersion: v.pipe(
        v.string(),
        v.description('`<major>.<minor>` of this API.'),
        v.examples(['1.11']),
      ),
      state: v.picklist(BRIDGE_STATES),
      startedAt: v.pipe(
        timestamp,
        v.description('When this bridge run started. Added in API 1.4.'),
      ),
    }),
    tcp: v.object({
      listening: v.boolean(),
      host: v.string(),
      port: integer(0),
      encoding: v.pipe(v.string(), v.description('Code page used to decode the socket voice.')),
      connections: v.pipe(
        v.array(ConnectionSchema),
        v.description('Open connections, oldest first.'),
      ),
    }),
    buffer: v.object({
      size: integer(0),
      maxEntries: integer(1),
      firstSeq: v.nullable(integer(1)),
      lastSeq: v.nullable(integer(1)),
    }),
    playwright: ServiceStatusSchema,
    mcp: ServiceStatusSchema,
    session: v.pipe(
      v.object({
        current: v.nullable(SessionSchema),
        count: v.pipe(integer(0), v.description('Number of sessions `GET /sessions` lists.')),
      }),
      v.description('Added in API 1.3.'),
    ),
  }),
  v.description('`GET /status`. `playwright` since API 1.1, `mcp` since 1.2, `session` since 1.3.'),
);

/** `GET /api/v1/status` */
export type StatusDto = v.InferOutput<typeof StatusSchema>;
