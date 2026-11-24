// The hand-written parts of docs/usage/openapi.yaml; `generate.ts` adds the schemas generated from
// the valibot schemas and writes the file (`pnpm openapi`). Edit the API's endpoints and prose here.
// `$ref`s point at `#/components/...`; a test checks that each one resolves.

import { API_VERSION } from '../api-version.js';

export const OPENAPI_VERSION = '3.1.0';

export const INFO = {
  title: 'screenreader-speech-capture bridge API',
  version: API_VERSION,
  summary: 'Capture what a screen reader says and read it over HTTP.',
  description: `REST + Server-Sent Events API of the bridge. \`info.version\` is the API version that
\`GET /status\` reports as \`bridge.apiVersion\` (\`<major>.<minor>\`; minor versions only add things).
The prose reference is \`docs/usage/http-api.md\`. The types match \`packages/shared\`.

This file describes the endpoints the bridge serves today.

Changes: 1.1 added \`playwright\` to \`GET /status\`, 1.2 added \`mcp\`, 1.3 added sessions
(\`/sessions\`, \`sessionId\` on entries, the \`session\` filter and SSE event, \`session\` in the
status), 1.4 added the bridge run (\`instanceId\` and \`startedAt\` in the status, \`instanceId\`
in \`SpeechList\`, the SSE \`bridge\` event), 1.5 added \`http.allowedHosts\` to the config, the
\`FORBIDDEN\` error and \`session=none\`, 1.6 added \`restartRequired\` to the \`/config\` answers. 1.7 removed the bridge run
(\`instanceId\` and the SSE \`bridge\` event) again: \`seq\` now keeps rising across restarts. 1.8
removed settings and fields of features that don't exist yet: \`tcp.format\` (one possible
value), \`input\` in the config and the status, and the \`INPUT_DISABLED\` error code. 1.9 added \`startSeq\` to \`Session\`. 1.10 added
\`client\` to \`Session\`, the \`X-SR-Speech-Client\` request header and \`replaced\` in the
\`POST /sessions\` answer. 1.11 added \`omitted\` to the timeout answer of \`GET /speech/wait\`,
which now holds the last 1000 entries seen instead of all of them. 1.12 added the \`position\`
event of \`GET /speech/stream\` and the replay of a \`Last-Event-ID\` above every \`seq\`. 1.13
removed \`restartRequired\` again (an exception to "minor versions only add", since no client
existed): \`PUT /config\` now only saves, a setting takes effect on the next start, and \`GET\`
shows the settings in use. 1.14 added native input (\`POST /input/click\`, \`POST /input/keys\`) and
the \`INPUT_DISABLED\` error code again. 1.15 added \`outsideEntries\` to \`GET /sessions\`. 1.16 added \`DELETE /sessions\`. 1.17 added the \`session\` parameter of \`DELETE /speech\` and the
\`sessionId\` in the \`data\` of a scoped \`clear\` event. 1.18 added the \`view\` parameter of \`GET /config\`
and \`GET /config/overrides\`. 1.19 added \`capture\` to \`POST /input/click\` and \`POST /input/keys\`
(the bridge records the speech the input causes and answers \`200\` with \`InputCapture\`). 1.20
added \`GET /markers/latest\` (the newest marker with a label, for a \`since\`). 1.21 added
\`POST /input/focus\` and the \`FOCUS_FAILED\` error code.

Every error has the same body (\`ErrorBody\`). Clients must handle unknown error codes as errors
of their HTTP status.

Every endpoint answers \`403 FORBIDDEN\` (\`Forbidden\`) when the \`Host\` header names a host the
bridge doesn't answer to, or a \`POST\` / \`PUT\` / \`DELETE\` carries a foreign \`Origin\`
(\`docs/usage/security.md#host-and-origin\`).
`,
  license: {
    name: 'MIT',
  },
};

export const SERVERS = [
  {
    url: 'http://localhost:5151/api/v1',
    description: 'Bridge on this machine (default HTTP port 5151)',
  },
  {
    url: 'http://{vm}:{port}/api/v1',
    description: 'Bridge on a test VM',
    variables: {
      vm: {
        default: 'my-test-vm',
      },
      port: {
        default: '5151',
      },
    },
  },
];

export const TAGS = [
  {
    name: 'speech',
    description: 'Recorded speech and markers',
  },
  {
    name: 'sessions',
    description: 'Sessions group the speech of one test or agent task',
  },
  {
    name: 'input',
    description: 'Native mouse and keyboard input on the VM',
  },
  {
    name: 'bridge',
    description: 'Status and configuration',
  },
];

export const PATHS = {
  '/speech': {
    get: {
      tags: ['speech'],
      operationId: 'listSpeech',
      summary: 'List speech entries and markers',
      description: `Entries with \`seq > since\`, oldest first. Page through the buffer by asking again with
the last entry's \`seq\` as \`since\` while \`hasMore\` is \`true\`.
`,
      parameters: [
        {
          $ref: '#/components/parameters/Since',
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Maximum number of entries in the response.',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 10000,
            default: 1000,
          },
        },
        {
          $ref: '#/components/parameters/Session',
        },
      ],
      responses: {
        '200': {
          description: `One page of entries. With \`session\`, \`truncated\` is only \`true\` when entries of that
session were dropped.
`,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SpeechList',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
      },
    },
    delete: {
      tags: ['speech'],
      operationId: 'clearSpeech',
      summary: 'Wipe the buffer, or clear one scope',
      description: `Without \`session\`, removes all entries and all ended sessions. The current session stays
current, empty. \`seq\` keeps counting. Meant for manual use: tests and agents start a session
instead.

With \`session\` (since API 1.17), removes only the entries and markers of the current session
(its \`id\` or \`current\`) or of \`none\` (the entries outside any session, also while a session is
current). The session stays current and keeps running, now with no entries. An ended session
cannot be cleared (\`INVALID_REQUEST\`): delete it with \`DELETE /sessions\`. The \`clear\` event
of \`GET /speech/stream\` then names the scope.
`,
      parameters: [
        {
          name: 'session',
          in: 'query',
          required: false,
          description:
            'Only clear this scope: the id of the current session, `current`, or `none`. Without it everything is wiped.',
          schema: {
            oneOf: [
              { type: 'integer', minimum: 1 },
              { type: 'string', enum: ['current', 'none'] },
            ],
          },
        },
      ],
      responses: {
        '204': {
          description: 'Cleared.',
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
      },
    },
  },
  '/speech/wait': {
    get: {
      tags: ['speech'],
      operationId: 'waitForSpeech',
      summary: 'Wait for a matching speech entry (long-poll)',
      description: `Waits for the first speech entry with \`seq > since\` that matches, including one that is
already in the buffer. Exactly one of \`contains\` and \`regex\` is required. Markers never
match. Closing the request stops the wait.

Answers \`200\` both on a match and on timeout; \`matched\` tells them apart. A timeout is an
expected answer, not an error (a \`408\` would make browsers and proxies repeat the
request).
`,
      parameters: [
        {
          name: 'contains',
          in: 'query',
          description: 'Substring to look for.',
          schema: {
            type: 'string',
            minLength: 1,
          },
          example: 'Submit, button',
        },
        {
          name: 'regex',
          in: 'query',
          description:
            'Regular expression (JavaScript syntax, `u` flag) to look for, instead of `contains`. At most 500 characters. It runs on every new entry, so a pattern that backtracks badly (`(a+)+$`) is slow and holds up the capture while it runs.',
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
          example: '^Submit',
        },
        {
          name: 'normalize',
          in: 'query',
          description: 'Ignore case and extra whitespace.',
          schema: {
            type: 'string',
            enum: ['1', 'true', '0', 'false'],
          },
        },
        {
          $ref: '#/components/parameters/Since',
        },
        {
          name: 'timeoutMs',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 0,
            maximum: 300000,
            default: 5000,
          },
        },
        {
          $ref: '#/components/parameters/Session',
        },
      ],
      responses: {
        '200': {
          description:
            'The matching entry, or on timeout the last 1000 entries seen after `since` and how many earlier ones were left out.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/WaitResult',
              },
              examples: {
                matched: {
                  summary: 'A match',
                  value: {
                    matched: true,
                    entry: {
                      seq: 42,
                      kind: 'speech',
                      text: 'Submit, button',
                      receivedAt: '2026-11-07T14:03:13.012Z',
                      source: 'tcp',
                      voice: 'ssc5000',
                      connectionId: 3,
                    },
                  },
                },
                timeout: {
                  summary: 'No match in time',
                  value: {
                    matched: false,
                    entries: [
                      {
                        seq: 41,
                        kind: 'speech',
                        text: 'Name, edit',
                        receivedAt: '2026-11-07T14:03:12.345Z',
                        source: 'tcp',
                        voice: 'ssc5000',
                        connectionId: 3,
                      },
                    ],
                    omitted: 0,
                  },
                },
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
        '503': {
          $ref: '#/components/responses/ServiceUnavailable',
        },
      },
    },
  },
  '/speech/stream': {
    get: {
      tags: ['speech'],
      operationId: 'streamSpeech',
      summary: 'Stream new entries (Server-Sent Events)',
      description: `One \`entry\` event per new entry, with the event \`id\` set to its \`seq\` and the entry as
JSON \`data\`. After a clear, a \`clear\` event with \`data: {}\`; after a clear of one scope (\`DELETE /speech?session=\`, since API 1.17) its \`data\` is
\`{"sessionId": 3}\` (\`null\` for the entries outside sessions), and only the entries of that scope are gone. When a session starts or
ends, a \`session\` event with the \`Session\` as \`data\` and no \`id\`. With \`session\`, only
that session's \`entry\` events are sent; \`session\` events always are, and \`clear\` events unless they only cleared another scope. A
\`: ping\` comment every 15 s keeps the connection open.

A stream opened without \`Last-Event-ID\` starts with a \`position\` event (\`data: {}\`, since
API 1.12), whose \`id\` is the highest \`seq\` handed out so far (the one before the first entry's, if
there is none yet; it counts entries dropped or cleared). A client that
remembers it reconnects with it as \`Last-Event-ID\`, so what was said before its first
entry is replayed too. Every entry that follows has a higher \`seq\`. Clients that don't
know the event ignore it.

A reconnect with \`Last-Event-ID\` first gets the buffered entries after that \`seq\`, then
the live ones, with nothing missed or repeated in between. \`seq\` keeps rising across
bridge restarts, so this also works after a restart. If some of the missed entries
were already dropped because the buffer was full, a \`truncated\` event with \`data: {}\`
comes before them. The same goes for a \`Last-Event-ID\` above every \`seq\` the bridge has
handed out (a cursor from another run, after the clock went back): \`truncated\`, then the
whole buffer (since API 1.12). The replay follows the client's reading speed. If entries are dropped
while it runs, another \`truncated\` event comes at that point, and a \`clear\` or \`session\`
event that happens meanwhile comes between the replayed entries.

A client that stops reading live events is disconnected once about 1 MiB is waiting for
it. It reconnects with \`Last-Event-ID\`.

\`\`\`
id: 41
event: position
data: {}

id: 42
event: entry
data: {"seq":42,"kind":"speech","text":"Submit, button",...}

event: clear
data: {}

event: truncated
data: {}

event: session
data: {"id":7,"name":"checkout test","run":null,...}
\`\`\`
`,
      parameters: [
        {
          $ref: '#/components/parameters/Session',
        },
        {
          name: 'Last-Event-ID',
          in: 'header',
          description: '`seq` of the last entry received before a reconnect.',
          schema: {
            type: 'integer',
            minimum: 0,
          },
        },
      ],
      responses: {
        '200': {
          description: 'The event stream. It stays open until the client or the bridge closes it.',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
      },
    },
  },
  '/markers': {
    post: {
      tags: ['speech'],
      operationId: 'addMarker',
      summary: 'Insert a marker into the timeline',
      description: `The body must be sent as \`application/json\` (\`400\` with \`field: content-type\` otherwise),
so a web page can't add markers cross-origin without a CORS preflight. At most 1 MiB.
`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/MarkerRequest',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'The new marker entry.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SpeechEntry',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
      },
    },
  },
  '/markers/latest': {
    get: {
      tags: ['speech'],
      operationId: 'latestMarker',
      summary: 'Find the newest marker with a label',
      description: `The newest marker whose text is \`label\` (since API 1.20), so a caller that only knows the label it
marked a step with can read from there: pass the marker's \`seq\` as \`since\`. The label is
trimmed and compared exactly. \`null\` when the scope has no such marker, also when it was
dropped from the full buffer or cleared.
`,
      parameters: [
        {
          name: 'label',
          in: 'query',
          required: true,
          description: 'The marker text to look for: not empty, at most 1000 characters (trimmed).',
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 1000,
          },
        },
        {
          $ref: '#/components/parameters/Session',
        },
      ],
      responses: {
        '200': {
          description: 'The marker, or `null`.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LatestMarker',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
      },
    },
  },
  '/input/click': {
    post: {
      tags: ['input'],
      operationId: 'click',
      summary: 'Click at a screen point',
      description: `Sends a native mouse click, to give a window the focus (\`docs/usage/native-input.md\`). With \`capture\` (since 1.19), also records the speech the click causes (\`docs/usage/native-input.md#capturing-the-speech-an-input-causes\`). The body must be sent as \`application/json\`.
`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ClickRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'With `capture`: the input was sent, and the speech it caused.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/InputCapture',
              },
            },
          },
        },
        '204': {
          description: 'Without `capture`: done.',
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '409': {
          $ref: '#/components/responses/InputDisabled',
        },
        '503': {
          $ref: '#/components/responses/ServiceUnavailable',
        },
      },
    },
  },
  '/input/keys': {
    post: {
      tags: ['input'],
      operationId: 'sendKeys',
      summary: 'Send key presses',
      description: `Presses one chord or a sequence of chords in the focused window (\`docs/usage/native-input.md#key-names\`). Requests are queued, so two requests never interleave. With \`capture\` (since 1.19), also records the speech the keys cause (\`docs/usage/native-input.md#capturing-the-speech-an-input-causes\`). The body must be sent as \`application/json\`.
`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/KeysRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'With `capture`: the input was sent, and the speech it caused.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/InputCapture',
              },
            },
          },
        },
        '204': {
          description: 'Without `capture`: done.',
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '409': {
          $ref: '#/components/responses/InputDisabled',
        },
        '503': {
          $ref: '#/components/responses/ServiceUnavailable',
        },
      },
    },
  },
  '/input/focus': {
    post: {
      tags: ['input'],
      operationId: 'focusWindow',
      summary: 'Bring a browser window to the front',
      description: `Makes a window of a browser the bridge started (Playwright MCP's, or one the Playwright server launched for a test) the foreground window, so the screen reader reads it and native keys reach it (since 1.21, \`docs/usage/native-input.md#bringing-the-browser-to-the-front\`). The bridge looks for visible top-level windows of the service's process tree, front to back; with \`title\`, only one whose title contains it (it waits up to 2 seconds for the title, which the browser updates a moment after \`document.title\` changes). Runs in the input queue. Windows only. The body must be sent as \`application/json\`.
`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/FocusRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'The window that is now in front.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/FocusedWindow',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          description:
            'No such window: the service is not running, has not opened a browser yet, or no window title contains `title`.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorBody',
              },
            },
          },
        },
        '409': {
          description:
            '`INPUT_DISABLED`: the bridge cannot manage windows here (not Windows, or `koffi` could not be loaded). `FOCUS_FAILED`: Windows refused to bring the window to the front.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorBody',
              },
            },
          },
        },
        '503': {
          $ref: '#/components/responses/ServiceUnavailable',
        },
      },
    },
  },
  '/sessions': {
    delete: {
      tags: ['sessions'],
      operationId: 'deleteSession',
      summary: 'Delete an ended session',
      description:
        'Removes an ended session and its entries from the buffer (since API 1.16). The current session cannot be deleted: end it first (`INVALID_REQUEST`), and neither can `none` (the entries outside sessions; use `DELETE /speech` to wipe everything). A session that is already gone (its entries were all dropped) is not an error. Publishes no event.',
      parameters: [
        {
          name: 'session',
          in: 'query',
          required: true,
          description: 'The `id` of the ended session to delete.',
          schema: {
            type: 'integer',
            minimum: 1,
          },
        },
      ],
      responses: {
        '204': {
          description: 'Deleted.',
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
        '404': {
          $ref: '#/components/responses/SessionNotFound',
        },
      },
    },
    get: {
      tags: ['sessions'],
      operationId: 'listSessions',
      summary: 'List the sessions',
      description:
        'The current session and the ended ones that still have entries in the buffer, newest first, ' +
        'and the number of entries outside any session (`outsideEntries`, since API 1.15).',
      responses: {
        '200': {
          description: 'The sessions.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SessionList',
              },
            },
          },
        },
      },
    },
    post: {
      tags: ['sessions'],
      operationId: 'startSession',
      summary: 'Start a session',
      description: `The new session becomes current and the previous one ends. Every entry recorded while it
is current, markers included, gets its \`sessionId\`. The body must be sent as
\`application/json\`. Starting while another client's session is current (by
\`X-SR-Speech-Client\`) is not refused: the bridge logs a warning and answers with that
session in \`replaced\`.
`,
      parameters: [
        {
          $ref: '#/components/parameters/Client',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/StartSessionRequest',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'The new session, and the session of another client it ended, if any.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/StartSessionResponse',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
      },
    },
  },
  '/sessions/end': {
    post: {
      tags: ['sessions'],
      operationId: 'endSession',
      summary: 'End the current session',
      description:
        "Entries after this have `sessionId` `null`. Does nothing if no session is current. Ending another client's session (by `X-SR-Speech-Client`) is logged as a warning.",
      parameters: [
        {
          $ref: '#/components/parameters/Client',
        },
      ],
      responses: {
        '204': {
          description: 'Ended (or none was current).',
        },
      },
    },
  },
  '/status': {
    get: {
      tags: ['bridge'],
      operationId: 'getStatus',
      summary: 'Bridge state, versions, TCP connections, buffer and child services',
      responses: {
        '200': {
          description: 'The current status.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Status',
              },
            },
          },
        },
      },
    },
  },
  '/config/overrides': {
    get: {
      tags: ['bridge'],
      operationId: 'getConfigOverrides',
      summary: 'The settings a flag or variable sets',
      description: `The settings that a flag or an environment variable sets at startup, with what sets each
(since 1.18). They win over the config file on every start, so changing them with \`PUT /config\`
has no effect until the flag or variable is removed. A UI shows these fields as read-only.
`,
      responses: {
        '200': {
          description: 'The overridden settings, empty if there are none.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ConfigOverrides',
              },
              example: {
                overrides: {
                  'tcp.port': '--tcp-port',
                },
              },
            },
          },
        },
      },
    },
  },
  '/config': {
    get: {
      tags: ['bridge'],
      operationId: 'getConfig',
      summary: 'The active or the saved configuration',
      description: `By default the active configuration: defaults, then the config file, then flags and
environment variables, as in use. It does not change while the bridge runs. \`view=saved\` answers
with the configuration the next start will use, as \`PUT\` does (since 1.18): the active one with
every update since the start on top. A setting that differs between the two needs a restart; one
listed by \`GET /config/overrides\` is still overridden then.
`,
      parameters: [
        {
          $ref: '#/components/parameters/ConfigView',
        },
      ],
      responses: {
        '200': {
          description: 'The configuration.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Config',
              },
            },
          },
        },
        '400': {
          $ref: '#/components/responses/InvalidRequest',
        },
      },
    },
    put: {
      tags: ['bridge'],
      operationId: 'updateConfig',
      summary: 'Change settings in the config file, for the next start',
      description: `Takes any subset of the configuration. The whole patch is checked first, then saved to the
config file (only the file's own settings plus the patch, never values from flags or
environment variables). The running bridge keeps its settings: they take effect on the next
start. A flag or environment variable still wins then (the bridge log warns about it).

The body must be \`application/json\` (\`400\` with \`field: content-type\` otherwise).
`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ConfigPatch',
            },
            example: {
              tcp: {
                port: 4450,
              },
              log: {
                level: 'debug',
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'The configuration the next start will use.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Config',
              },
            },
          },
        },
        '400': {
          description: `Invalid or unknown setting, or a body that is not JSON. \`error.details.field\` names it.
`,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorBody',
              },
              example: {
                error: {
                  code: 'INVALID_REQUEST',
                  message:
                    'tcp.port: Cannot listen on 127.0.0.1:4450: the port is already in use (is another bridge running?)',
                  details: {
                    field: 'tcp.port',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const PARAMETERS = {
  Since: {
    name: 'since',
    in: 'query',
    description: 'Only entries with `seq` greater than this.',
    schema: {
      type: 'integer',
      minimum: 0,
      default: 0,
    },
  },
  Session: {
    name: 'session',
    in: 'query',
    description: `Only entries of this session: its \`id\`, \`current\` for the session that is current
when the request arrives (it is not followed to later sessions), or \`none\` for the
entries recorded outside any session (\`sessionId: null\`, since 1.5).
`,
    schema: {
      oneOf: [
        {
          type: 'integer',
          minimum: 1,
        },
        {
          type: 'string',
          enum: ['current', 'none'],
        },
      ],
    },
  },
  ConfigView: {
    name: 'view',
    in: 'query',
    description: `\`active\` (default): the configuration in use. \`saved\`: the configuration the next start
will use (since 1.18).
`,
    schema: {
      type: 'string',
      enum: ['active', 'saved'],
      default: 'active',
    },
  },
  Client: {
    name: 'X-SR-Speech-Client',
    in: 'header',
    required: false,
    description:
      "Names the client (the library sends `<host> pid <process id>`, the CLI `<host> cli`), so the bridge can warn when one client ends or replaces another one's session. Trimmed, at most 1000 characters. Added in API 1.10.",
    schema: {
      type: 'string',
      maxLength: 1000,
    },
  },
};

export const RESPONSES = {
  SessionNotFound: {
    description: '`session=current` while no session is current, or a session id never given out.',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ErrorBody',
        },
        example: {
          error: {
            code: 'NOT_FOUND',
            message: 'No session is current',
          },
        },
      },
    },
  },
  InvalidRequest: {
    description: 'Bad query or body. `error.details.field` names the field.',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ErrorBody',
        },
        example: {
          error: {
            code: 'INVALID_REQUEST',
            message: 'limit: must be an integer from 1 to 10000',
            details: {
              field: 'limit',
            },
          },
        },
      },
    },
  },
  InputDisabled: {
    description:
      'Native input is not available: the bridge could not load `@jitsi/robotjs` (for example outside Windows). `error.message` names the reason.',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ErrorBody',
        },
        example: {
          error: {
            code: 'INPUT_DISABLED',
            message: 'Native input is not available: @jitsi/robotjs could not be loaded',
          },
        },
      },
    },
  },
  Forbidden: {
    description: 'Foreign `Host` header or `Origin` (DNS rebinding and cross-site protection).',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ErrorBody',
        },
        example: {
          error: {
            code: 'FORBIDDEN',
            message:
              'Host "rebind.example" is not allowed. Use the bridge\'s IP address, or add the name to http.allowedHosts (--allowed-hosts)',
            details: {
              host: 'rebind.example',
            },
          },
        },
      },
    },
  },
  ServiceUnavailable: {
    description: 'The bridge is shutting down.',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ErrorBody',
        },
      },
    },
  },
};
