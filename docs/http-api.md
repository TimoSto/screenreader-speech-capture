# HTTP API

The bridge's REST + SSE interface. Tests and agents usually use the [client](client.md) instead.

Machine-readable spec: [`openapi.yaml`](openapi.yaml)
(OpenAPI 3.1, the endpoints the bridge serves today).

Base URL: `http://<vm>:5151/api/v1`. All responses are JSON unless noted otherwise. Errors use one
format for every endpoint (see [Errors](#errors)).

## Data model

```jsonc
// SpeechEntry
{
  "seq": 1794641987742,                  // increasing: survives clear, keeps rising across restarts
  "kind": "speech",                      // "speech" | "marker"
  "text": "Submit, button",
  "receivedAt": "2026-11-07T14:03:12.345Z",
  "source": "tcp",                       // "tcp" | "api" (markers)
  "voice": "ssc5000",                    // tcpHeader of the sending voice, null if not set
  "connectionId": 3,                     // TCP connection that delivered it
  "sessionId": 7                         // session that was current, null outside any session
}

// Session (see Sessions in speech-capture.md)
{
  "id": 7,                               // increasing, restarts at 1 with the bridge
  "name": "form › submit button is announced",
  "run": "2026-11-12T09:30:00Z",         // optional label that groups sessions, null if not set
  "client": "ci-runner pid 4242",        // X-SR-Speech-Client of the starter, null if not sent (since API 1.10)
  "startedAt": "2026-11-12T09:31:04.120Z",
  "endedAt": null,                       // set when the session ends, null while it is current
  "startSeq": 339,                       // last seq before the session started (since API 1.9)
  "firstSeq": 340,                       // first and last entry still in the buffer, null if none
  "lastSeq": 342,
  "entries": 3                           // entries of this session still in the buffer
}
```

A [session](speech-capture.md#sessions) groups the entries of one test or agent task. Only one is
current at a time. The `session` parameter of the speech endpoints takes an `id`, `current`, or
`none` for the entries recorded outside any session (`sessionId: null`, since API 1.5).
`current` means the session that is current when the request arrives: a wait or stream stays on
it when a later session starts (a stream learns about that from the `session` event). `current`
while no session is current, or an `id` the bridge never gave out, answers `404 NOT_FOUND`. An
ended session whose entries have all left the buffer is not an error: it just has no entries.

`seq` keeps rising across bridge restarts: the first entry of a bridge run gets the run's start
time in milliseconds (`bridge.startedAt`), and every entry after it the next number. So a `seq`
from an earlier run is lower than every entry of the new one, and `since` or `Last-Event-ID` with
it reads the new run from its start. The old run's entries are gone. Session ids start again at 1
with every run.

## Endpoints

| Method & path | Description |
|---|---|
| `GET /api/v1/speech?since=<seq>&limit=<n>&session=<id>` | List speech entries and markers with `seq > since` (oldest first). `since` defaults to `0`, `limit` to `1000` (max `10000`). Response: `{ "entries": [...], "truncated": false, "hasMore": false }`. `truncated` is `true` when entries after `since` were dropped because the buffer was full. `hasMore` is `true` when more entries follow: ask again with the last entry's `seq` as `since`. `session` (an `id`, `current` or `none`) returns only that session's entries; `truncated` then only counts dropped entries of that session. |
| `DELETE /api/v1/speech` | Wipe the buffer and all ended sessions (`204`, no body). The current session stays current. Tests and agents start a session instead (see [Sessions](speech-capture.md#sessions)). |
| `GET /api/v1/speech/stream?session=<id>` | Server-Sent Events: one `entry` event per new entry (event `id` = `seq`), a `clear` event after a clear, and a `session` event (data: the `Session`) when a session starts or ends. `session` (an `id`, `current` or `none`) limits `entry` events to that session; `session` events are always sent. A reconnect with `Last-Event-ID` first gets the entries it missed from the buffer, also after a bridge restart, preceded by a `truncated` event if some of them were already dropped because the buffer was full. A `: ping` comment every 15 s keeps the connection open. A client that stops reading is disconnected once about 1 MiB is waiting for it; it reconnects with `Last-Event-ID`. |
| `GET /api/v1/speech/wait?contains=<text>&since=<seq>&timeoutMs=<n>` | Long-poll until a speech entry with `seq > since` matches (also if it arrived before the request). `regex=<pattern>` can be used instead of `contains` (at most 500 characters, and no repeated group that repeats inside, such as `(a+)+`: it runs on every new entry, so a pattern that backtracks badly would stall the capture), `normalize=1` ignores case and extra whitespace, `session=<id>|current|none` only matches that session's entries. Markers never match. `since` defaults to `0`, `timeoutMs` to `5000` (max `300000`). Always `200`: `{ "matched": true, "entry": {...} }`, or on timeout `{ "matched": false, "entries": [...] }` with every entry seen after `since`. A timeout is an expected answer, not an error (a `408` would make browsers and proxies repeat the request). |
| `POST /api/v1/markers` `{ "label": "step 3" }` | Insert a marker into the timeline (shown in the UI, returned in lists). Requires `content-type: application/json` (a web page can't send that cross-origin without a CORS preflight). Returns `201` with the new entry. |
| `POST /api/v1/sessions` `{ "name": "checkout test", "run": "nightly-42" }` | Start a [session](speech-capture.md#sessions): it becomes current and the previous one ends. `name` is required, `run` optional (both trimmed, not empty, at most 1000 characters). Requires `content-type: application/json`. Returns `201` with the new `Session`; its `startSeq` is the `since` that reads it from its start. If another client's session was current (see [Clients](#clients)), it is not refused: the bridge logs a warning and the answer has that session in `replaced` (otherwise `null`, since API 1.10). |
| `POST /api/v1/sessions/end` | End the current session (`204`). Entries after this have `sessionId: null`. Does nothing if no session is current. Ending another client's session is logged as a warning. |
| `GET /api/v1/sessions` | `{ "sessions": [...], "currentId": 7 }`: the sessions that still have entries in the buffer, plus the current one, newest first. `currentId` is `null` when no session is current. |
| `POST /api/v1/set-focus` `{ "x": 640, "y": 12, "button": "left" }` | *(planned, [M4](ROADMAP.md#m4-native-input-))* Native mouse click at screen coordinates (physical pixels). See [Native input](native-input.md). |
| `POST /api/v1/input/keys` `{ "keys": "Insert+T" \| ["h", "h"], "delayMs": 50 }` | *(planned, [M4](ROADMAP.md#m4-native-input-))* Native key presses: one chord, or a sequence with `delayMs` between them. |
| `GET /api/v1/config` / `PUT /api/v1/config` | Read or update the configuration. `PUT` takes any subset as `application/json`, saves it to the config file, applies what can change while running and answers with the configuration in use plus `restartRequired` (since API 1.6): the restart-only settings, such as ports, saved for the next start. See [Changing settings](configuration.md#changing-settings). |
| `GET /api/v1/status` | Bridge and API version, when the bridge started (`startedAt`), state (`starting` / `ready` / `stopping`), TCP connections, buffer size, Playwright / MCP process state and versions, current session. |

`GET /api/v1/status` example:

```jsonc
{
  "bridge": {
    "version": "0.3.0",
    "apiVersion": "1.10",
    "state": "ready",
    "startedAt": "2026-11-07T14:00:58.000Z"
  },
  "tcp": {
    "listening": true,
    "host": "127.0.0.1",
    "port": 4449,
    "encoding": "windows-1252",
    "connections": [{ "id": 3, "voice": null, "connectedAt": "2026-11-07T14:01:02.000Z" }]
  },
  "buffer": { "size": 120, "maxEntries": 10000, "firstSeq": 223, "lastSeq": 342 },
  "playwright": { "state": "running", "version": "1.65.0", "port": 3000, "restarts": 0, "exitCode": null },
  "mcp": { "state": "running", "version": "0.0.85", "port": 8931, "restarts": 0, "exitCode": null },
  "session": { "current": { "id": 7, "name": "checkout test", "run": null, "client": null, "startedAt": "2026-11-07T14:02:55.000Z", "endedAt": null, "startSeq": 339, "firstSeq": 340, "lastSeq": 342, "entries": 3 }, "count": 12 }
}
```

## Clients

A client may name itself with the `X-SR-Speech-Client` request header (since API 1.10; the
library sends `<host> pid <process id>`, the CLI `<host> cli`). The bridge stores it as the
session's `client`. One screen reader means one current session, so when a client starts or ends
a session another client started, the bridge doesn't refuse: it logs a `[bridge]` warning and
`POST /sessions` returns the replaced session in `replaced`. Without the header the client is
unknown (`null`); replacing an unknown client's session as an unknown client is not warned about
([decisions](decisions.md#sessions-warn-instead-of-locking)).

## curl examples

```bash
VM=http://my-test-vm:5151

curl -X POST $VM/api/v1/sessions -H 'content-type: application/json' -d '{"name":"checkout test"}'
curl "$VM/api/v1/speech?session=current"
curl "$VM/api/v1/speech/wait?contains=Submit%2C%20button&timeoutMs=5000"
curl -N $VM/api/v1/speech/stream
curl -X POST $VM/api/v1/sessions/end
curl -X DELETE $VM/api/v1/speech   # wipe everything
curl -X POST $VM/api/v1/input/keys -H 'content-type: application/json' -d '{"keys":"Insert+T"}'   # planned (M4)
```

For tests and agents, the [test client](client.md) wraps these endpoints.

## Errors

Every error response has the same body:

```jsonc
{
  "error": {
    "code": "INVALID_REQUEST",         // stable, machine-readable
    "message": "limit: must be an integer from 1 to 10000",
    "details": { "field": "limit" }    // optional, depends on the code
  }
}
```

| HTTP status | `code` | When |
|---|---|---|
| `400` | `INVALID_REQUEST` | Bad query or body (unknown key name, invalid regex, invalid config value). `details.field` names the field. |
| `403` | `FORBIDDEN` | The `Host` header names a host the bridge doesn't answer to, or a `POST` / `PUT` / `DELETE` comes from another page's `Origin` ([Host and origin](security.md#host-and-origin)). Since API 1.5. |
| `404` | `NOT_FOUND` | Unknown endpoint. |
| `409` | `INPUT_DISABLED` | Native input endpoint called, but input is off (`--no-input`, or not on Windows). *(planned, [M4](ROADMAP.md#m4-native-input-))* |
| `503` | `SERVICE_UNAVAILABLE` | The bridge is shutting down (for example a pending `wait`). |
| `500` | `INTERNAL` | Anything else. The bridge log has the details. |

New codes may be added in minor versions. Clients must handle unknown codes as errors of their HTTP
status.

## Versioning

- All paths start with **`/api/v1`**. A breaking change to the API gets a new prefix (`/api/v2`).
  For a while, the bridge serves both.
- `GET /api/v1/status` returns `bridge.version` (the package version) and `bridge.apiVersion`
  (`<major>.<minor>` of the API). Minor versions only add things (endpoints, fields, error codes).
- The bridge and client packages are **versioned independently**: a package is only released when
  it changes, and its semver covers its own surface (for the bridge also CLI flags and the config
  file). Whether a client works with a bridge depends only on `apiVersion`, not on the package
  versions.
- The client checks `apiVersion` on its first call:
  - **different major version:** error (`IncompatibleBridgeError`, CLI exit code `2`),
  - **another minor version:** works, no warning. Install the bridge and the client from the same
    release; the client doesn't check for features an older bridge lacks.
