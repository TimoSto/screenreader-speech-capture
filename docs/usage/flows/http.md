# HTTP flows

Sequence diagrams of the plain HTTP calls: reading, waiting, sessions, markers, config and the
errors on the way. The rules behind them are in the [HTTP API](../http-api.md); the
[test client](../client.md) wraps all of these calls.

**Contents**

1. [Read speech page by page](#read-speech-page-by-page)
2. [Wait for output: match](#wait-for-output-match)
3. [Wait for output: timeout](#wait-for-output-timeout)
4. [One session per test](#one-session-per-test)
5. [Two clients share the screen reader](#two-clients-share-the-screen-reader)
6. [A marker as a starting point](#a-marker-as-a-starting-point)
7. [Clear the buffer](#clear-the-buffer)
8. [Change the configuration](#change-the-configuration)
9. [Rejected requests](#rejected-requests)
10. [Version check on the first call](#version-check-on-the-first-call)

## Read speech page by page

`GET /speech` returns at most `limit` entries after `since`. `hasMore` says that more follow: ask
again with the last `seq` as `since`. Details: [Endpoints](../http-api.md#endpoints).

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Bridge :5151

    C->>B: GET /api/v1/speech?since=0&limit=1000
    B-->>C: 200 entries seq 1..1000, hasMore: true, truncated: false
    C->>B: GET /api/v1/speech?since=1000&limit=1000
    B-->>C: 200 entries seq 1001..1420, hasMore: false
    Note over C: the last seq (1420) is the since of the next read
```

## Wait for output: match

`GET /speech/wait` first looks through the buffer after `since`, so speech that arrived before the
request is found too, then waits for new entries. Details: [Endpoints](../http-api.md#endpoints).

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    SR->>B: "Submit, button" (TCP :4449) → seq 41
    C->>B: GET /api/v1/speech/wait?contains=Submit&since=40&timeoutMs=5000
    Note over B: buffer after seq 40 already has a match
    B-->>C: 200 matched: true, entry seq 41
    C->>B: GET /api/v1/speech/wait?contains=Name&since=41&timeoutMs=5000
    Note over B: no match yet, the request stays open
    SR->>B: "Name, edit, blank" → seq 42
    B-->>C: 200 matched: true, entry seq 42
```

## Wait for output: timeout

A timeout is an answer, not an error: `200` with `matched: false`, the last 1000 entries seen after
`since` and how many earlier ones were left out (`omitted`). Details:
[Endpoints](../http-api.md#endpoints).

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    C->>B: GET /api/v1/speech/wait?contains=Submit&since=40&timeoutMs=5000
    SR->>B: "Name, edit, blank" → seq 41
    SR->>B: "Email, edit" → seq 42
    Note over B: 5 s pass without a match
    B-->>C: 200 matched: false, entries seq 41..42, omitted: 0
    Note over C: client library: SpeechTimeoutError with entries<br/>CLI wait: exit code 1
```

## One session per test

A session groups the speech of one test or agent task. Its `startSeq` is the `since` that reads it
from its start; `session=current` limits reads and waits to it. Details:
[Sessions](../speech-capture.md#sessions).

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    C->>B: POST /api/v1/sessions {"name": "checkout test", "run": "nightly-42"}
    B-->>C: 201 session id 7, startSeq 339, replaced: null
    SR->>B: "Checkout, heading level 1" → seq 340, sessionId 7
    C->>B: GET /api/v1/speech/wait?contains=Checkout&since=339&session=current
    B-->>C: 200 matched: true, entry seq 340
    C->>B: GET /api/v1/speech?since=339&session=current
    B-->>C: 200 entries of session 7
    C->>B: POST /api/v1/sessions/end
    B-->>C: 204
    SR->>B: "Desktop" → seq 341, sessionId null
```

## Two clients share the screen reader

One screen reader means one current session. A second client's session is not refused: it ends the
first one, the bridge logs a warning, and the answer names the session it replaced. Details:
[Clients](../http-api.md#clients).

```mermaid
sequenceDiagram
    participant A as Client A<br/>(X-SR-Speech-Client: ci pid 1)
    participant B as Bridge :5151
    participant C2 as Client B<br/>(X-SR-Speech-Client: ci pid 2)

    A->>B: POST /api/v1/sessions {"name": "test 1"}
    B-->>A: 201 session 7, replaced: null
    C2->>B: POST /api/v1/sessions {"name": "test 2"}
    Note over B: session 7 ends, the log warns that<br/>session 8 (ci pid 2) replaced session 7 (ci pid 1)
    B-->>C2: 201 session 8, replaced: session 7
    Note over A: A's speech now lands in session 8:<br/>run screen reader tests serially
```

## A marker as a starting point

A marker is an entry in the timeline. Its `seq` is a `since` that starts right after it. Markers
never match a wait. Details: [Endpoints](../http-api.md#endpoints).

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    C->>B: POST /api/v1/markers {"label": "step 3"}
    B-->>C: 201 entry kind: marker, seq 50
    SR->>B: "Next, link" → seq 51
    C->>B: GET /api/v1/speech?since=50
    B-->>C: 200 entries seq 51.. (markers included)
```

## Clear the buffer

`DELETE /speech` is a global wipe for manual use: all entries and all ended sessions go, the current
session stays current and empty. `seq` keeps rising. Tests and agents start a session instead.
Details: [Sessions](../speech-capture.md#sessions).

```mermaid
sequenceDiagram
    participant B as Bridge :5151
    participant C as Client
    participant S as SSE readers

    C->>B: DELETE /api/v1/speech
    Note over B: buffer and ended sessions removed,<br/>current session stays, seq not reset
    B-->>C: 204
    B-->>S: event: clear
```

## Change the configuration

`PUT /config` checks the whole patch, saves it, then applies what can change while running.
Restart-only settings are saved and listed in `restartRequired`. Details:
[Changing settings](../configuration.md#changing-settings).

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Bridge :5151
    participant F as config.json

    C->>B: PUT /api/v1/config {"buffer": {"maxEntries": 50000}, "tcp": {"port": 4450}}
    alt a value is invalid
        B-->>C: 400 INVALID_REQUEST, details.field (nothing changed)
    else valid
        B->>F: save the file's settings + the patch
        Note over B: buffer.maxEntries applies at once,<br/>tcp.port waits for the next start
        B-->>C: 200 config in use, restartRequired: ["tcp.port"]
    end
```

## Rejected requests

Every error has the same body (`error.code`, `message`, `details`). Details:
[Errors](../http-api.md#errors), [Host and origin](../security.md#host-and-origin).

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Bridge :5151

    C->>B: GET /api/v1/speech (Host: unknown.example)
    B-->>C: 403 FORBIDDEN (host not allowed)
    C->>B: POST /api/v1/markers (Origin: https://other.page)
    B-->>C: 403 FORBIDDEN (foreign origin)
    C->>B: GET /api/v1/speech?session=current (no session current)
    B-->>C: 404 NOT_FOUND
    C->>B: GET /api/v1/speech?limit=0
    B-->>C: 400 INVALID_REQUEST, details.field: limit
    C->>B: GET /api/v1/speech/wait?contains=x
    Note over B: Ctrl+C on the VM, bridge stops
    B-->>C: 503 SERVICE_UNAVAILABLE
```

## Version check on the first call

The client reads `apiVersion` once, before its first real call. Another major version stops it;
another minor version works. Details: [Versioning](../http-api.md#versioning).

```mermaid
sequenceDiagram
    participant T as Test / CLI
    participant C as Client library
    participant B as Bridge :5151

    T->>C: waitForOutput("Submit")
    C->>B: GET /api/v1/status
    B-->>C: 200 bridge.apiVersion "1.11"
    alt same major version
        C->>B: GET /api/v1/speech?since=…
        Note over C: later calls skip the check
    else other major version (e.g. "2.0")
        C-->>T: IncompatibleBridgeError (CLI: exit code 2)
    end
```
