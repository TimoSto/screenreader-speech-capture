# HTTP API

The bridge's REST + SSE interface. Tests and agents usually use the [client](client.md) instead.

Base URL: `http://<vm>:5151/api/v1`. All responses are JSON unless noted otherwise. Errors use one
format for every endpoint (see [Errors](#errors)).

## Data model

```jsonc
// SpeechEntry
{
  "seq": 42,                             // increasing sequence number: survives clear, restarts at 1 with the bridge
  "kind": "speech",                      // "speech" | "marker"
  "text": "Submit, button",
  "receivedAt": "2026-11-07T14:03:12.345Z",
  "monotonicMs": 123456.789,             // high-resolution, for measuring durations
  "source": "tcp",                       // "tcp" | "api" (markers)
  "voice": "ssc5000",                    // tcpHeader of the sending voice, null if not set
  "connectionId": 3                      // TCP connection that delivered it
}
```

## Endpoints

| Method & path | Description |
|---|---|
| `GET /api/v1/speech?since=<seq>&limit=<n>` | List speech entries and markers with `seq > since` (oldest first). `since` defaults to `0`, `limit` to `1000` (max `10000`). Response: `{ "entries": [...], "truncated": false }`. `truncated` is `true` when entries after `since` were dropped because the buffer was full. |
| `DELETE /api/v1/speech` | Clear the buffer. Call this between tests. |
| `GET /api/v1/speech/stream` | Server-Sent Events: one `entry` event per new entry (event `id` = `seq`) and a `clear` event after a clear. A reconnect with `Last-Event-ID` first gets the entries it missed from the buffer. A `: ping` comment every 15 s keeps the connection open. |
| `GET /api/v1/speech/wait?contains=<text>&since=<seq>&timeoutMs=<n>` | Long-poll until a speech entry with `seq > since` matches, then return it (also if it arrived before the request). `regex=<pattern>` can be used instead of `contains`, `normalize=1` ignores case and extra whitespace. Markers never match. `since` defaults to `0`, `timeoutMs` to `5000` (max `300000`). Returns `408` (`TIMEOUT`) on timeout, with the entries seen so far in `error.details.entries`. |
| `POST /api/v1/markers` `{ "label": "step 3" }` | Insert a marker into the timeline (shown in the UI, returned in lists). |
| `POST /api/v1/set-focus` `{ "x": 640, "y": 12, "button": "left" }` | Native mouse click at screen coordinates (physical pixels). See [Native input](native-input.md). |
| `POST /api/v1/input/keys` `{ "keys": "Insert+T" \| ["h", "h"], "delayMs": 50 }` | Native key presses: one chord, or a sequence with `delayMs` between them. |
| `GET /api/v1/config` / `PUT /api/v1/config` | Read or update the configuration. Changing ports restarts the affected listeners. |
| `GET /api/v1/status` | Bridge and API version, state (`starting` / `ready`), TCP connections, buffer size, Playwright / MCP process state and versions, native input available. |
| `POST /api/v1/services/{playwright\|mcp}/{start\|stop\|restart}` | Control the child services. |

`GET /api/v1/status` example:

```jsonc
{
  "bridge": { "version": "0.3.0", "apiVersion": "1.2", "state": "ready" },
  "tcp": {
    "listening": true,
    "encoding": "windows-1252",
    "connections": [{ "id": 3, "voice": null, "connectedAt": "2026-11-07T14:01:02.000Z" }]
  },
  "buffer": { "size": 120, "firstSeq": 223, "lastSeq": 342 },
  "playwright": { "state": "running", "version": "1.56.1", "port": 3000, "restarts": 0 },
  "mcp": { "state": "running", "version": "0.0.40", "port": 8931 },
  "input": { "enabled": true }
}
```

## curl examples

```bash
VM=http://my-test-vm:5151

curl -X DELETE $VM/api/v1/speech
curl "$VM/api/v1/speech?since=0"
curl "$VM/api/v1/speech/wait?contains=Submit%2C%20button&timeoutMs=5000"
curl -N $VM/api/v1/speech/stream
curl -X POST $VM/api/v1/input/keys -H 'content-type: application/json' -d '{"keys":"Insert+T"}'
```

For tests and agents, the [test client](client.md) wraps these endpoints.

## Errors

Every error response has the same body:

```jsonc
{
  "error": {
    "code": "TIMEOUT",                 // stable, machine-readable
    "message": "No speech matched \"Submit, button\" within 5000 ms",
    "details": { "entries": [ /* … */ ] }      // optional, depends on the code
  }
}
```

| HTTP status | `code` | When |
|---|---|---|
| `400` | `INVALID_REQUEST` | Bad query or body (unknown key name, invalid regex, invalid config value). `details.field` names the field. |
| `404` | `NOT_FOUND` | Unknown endpoint or service name. |
| `408` | `TIMEOUT` | `wait` found no match in time. `details.entries` holds the entries seen so far. |
| `409` | `INPUT_DISABLED` | Native input endpoint called, but input is off (`--no-input`, or not on Windows). |
| `503` | `SERVICE_UNAVAILABLE` | The bridge is still starting, or a child service (Playwright / MCP) is not running. |
| `500` | `INTERNAL` | Anything else. The bridge log has the details. |

New codes may be added in minor versions. Clients must handle unknown codes as errors of their HTTP
status.

## Versioning

- All paths start with **`/api/v1`**. A breaking change to the API gets a new prefix (`/api/v2`).
  For a while, the bridge serves both.
- `GET /api/v1/status` returns `bridge.version` (the package version) and `bridge.apiVersion`
  (`<major>.<minor>` of the API). Minor versions only add things (endpoints, fields, error codes).
- The bridge and client packages are released together with the **same version number**.
- The client checks `apiVersion` on its first call:
  - **different major version:** error (`IncompatibleBridgeError`, CLI exit code `2`),
  - **bridge older than the client (minor):** error only when a function needs something the
    bridge doesn't have yet,
  - **bridge newer (minor):** works, no warning.
