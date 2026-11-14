# Live feed (SSE) flows

Sequence diagrams of the Server-Sent Events stream `GET /api/v1/speech/stream` and the client
functions built on it. The stream's rules are in the [HTTP API](../http-api.md#endpoints), the
client side in [Test client → Live feed](../client.md#live-feed).

**Contents**

1. [Subscribe to the live feed](#subscribe-to-the-live-feed)
2. [Reconnect without losing an entry](#reconnect-without-losing-an-entry)
3. [Reconnect across a bridge restart](#reconnect-across-a-bridge-restart)
4. [Session and clear events](#session-and-clear-events)
5. [A slow reader is disconnected](#a-slow-reader-is-disconnected)
6. [How the client waits](#how-the-client-waits)
7. [Wait for silence and record](#wait-for-silence-and-record)

## Subscribe to the live feed

One long-lived HTTP response that the bridge keeps writing to. `onSpeech` and the CLI's `tail`
wrap it, so nobody parses the stream by hand.

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client<br/>(onSpeech / tail)

    C->>B: GET /api/v1/speech/stream
    B-->>C: 200 text/event-stream (stays open)
    SR->>B: "Submit, button" (TCP :4449)
    B-->>C: id: 41, event: entry, data: {"seq":41, "text":"Submit, button", ...}
    Note over B,C: ": ping" every 15 s keeps the connection open,<br/>"event: clear" follows a clear
    Note over B,C: connection lost (network, bridge restart)
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 41
    B-->>C: replays the entries after seq 41, then goes on live
```

## Reconnect without losing an entry

The client remembers the last `seq` it saw and reconnects with it as `Last-Event-ID` (after 250 ms,
doubling up to 5 s). No data for 45 s, not even a ping, also counts as a lost connection. The
replay follows the reader's speed, then the stream goes on live.

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    C->>B: GET /api/v1/speech/stream
    B-->>C: event: entry seq 41
    Note over C: connection lost
    SR->>B: "Name, edit" → seq 42
    SR->>B: "Email, edit" → seq 43
    Note over C: wait 250 ms (then 500 ms, 1 s, … 5 s)
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 41
    B-->>C: event: entry seq 42 (replay from the buffer)
    B-->>C: event: entry seq 43 (replay)
    SR->>B: "Submit, button" → seq 44
    B-->>C: event: entry seq 44 (live)
```

## Reconnect across a bridge restart

`seq` keeps rising across restarts: the first entry of a run gets the run's start time in
milliseconds. A `Last-Event-ID` from the old run is lower than every new entry, so the replay
starts at the new run's first entry. The old run's entries are gone. Details:
[Data model](../http-api.md#data-model).

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client

    B-->>C: event: entry seq 1794641987742
    Note over B: bridge restarts (buffer and sessions are empty)
    Note over C: connection lost, retrying
    SR->>B: "Desktop" → seq 1794642100000 (new run's start time)
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 1794641987742
    B-->>C: event: entry seq 1794642100000
    Note over C: the feed goes on from the new run's first entry
```

## Session and clear events

`session` events are sent whenever a session starts or ends, also on a stream limited to one
session. A clear sends `clear`. Details: [Sessions](../speech-capture.md#sessions).

```mermaid
sequenceDiagram
    participant T as Test client
    participant B as Bridge :5151
    participant C as Reader<br/>(stream?session=current)

    C->>B: GET /api/v1/speech/stream?session=current
    Note over B: current = session 7, the stream stays on it
    T->>B: POST /api/v1/sessions {"name": "test 2"}
    B-->>C: event: session, data: session 7 with endedAt
    B-->>C: event: session, data: session 8
    Note over C: entries of session 8 are not sent on this stream
    T->>B: DELETE /api/v1/speech
    B-->>C: event: clear
```

## A slow reader is disconnected

A client that stops reading live events is cut off once about 1 MiB waits for it, so it can't
hold the bridge's memory. It reconnects with `Last-Event-ID` and catches up at its own speed.

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151
    participant C as Client (stalled)

    C->>B: GET /api/v1/speech/stream
    loop the client doesn't read
        SR->>B: speech
        Note over B: queued for this client
    end
    Note over B: about 1 MiB waiting
    B--xC: connection closed
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: last seq read
    B-->>C: replay at the client's speed, then live
```

## How the client waits

`waitForOutput` / `waitForSequence` don't poll and don't use `GET /speech/wait`: they read the
buffer after the cursor once, and if nothing matches yet, follow the stream from the last entry
read. Details: [The cursor](../client.md#the-cursor).

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>C: waitForOutput("Submit, button")
    C->>B: GET /api/v1/speech?since=cursor (all pages)
    B-->>C: entries up to seq 41, no match
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 41
    SR->>B: "Submit, button" → seq 42
    B-->>C: event: entry seq 42
    C->>B: close the stream
    Note over C: cursor = 42
    C-->>T: entry seq 42
```

## Wait for silence and record

`waitForSilence` follows the stream until nothing has been spoken for `quietFor` ms, counted from
the call. `record(fn)` notes the newest `seq`, runs `fn`, waits for silence and reads everything
after the noted `seq`. Details: [Functions](../client.md#functions).

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>C: record(() => page.keyboard.press('Tab'))
    C->>B: GET /api/v1/status
    B-->>C: buffer.lastSeq 50
    C->>C: run fn (Tab in the browser)
    SR->>B: "Name, edit, blank" → seq 51
    Note over C: waitForSilence starts
    C->>B: GET /api/v1/status
    B-->>C: buffer.lastSeq 51
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 51
    SR->>B: "blank" → seq 52
    B-->>C: event: entry seq 52 (silence counted again)
    Note over C: 500 ms (quietFor) without speech
    C->>B: close the stream
    C->>B: GET /api/v1/speech?since=50
    B-->>C: entries seq 51..52, truncated: false
    Note over C: cursor = 52
    C-->>T: result, entries, truncated
```
