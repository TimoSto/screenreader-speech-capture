# SSE replay flows

Sequence diagrams of how `followLog` (`application/shared/follow-log.ts`) and `SseHub`
(`adapters/in/http/sse/`) hand a reader the buffer and then the live events, with nothing missed or
sent twice. The rules are in [Decisions → The SSE replay follows the reader](../decisions.md#the-sse-replay-follows-the-reader)
and [Runtime model](../architecture.md#runtime-model); what a client sees is in the
[usage SSE flows](../../usage/flows/sse.md).

**Contents**

1. [Subscribe first, then read](#subscribe-first-then-read)
2. [Pacing and backpressure](#pacing-and-backpressure)
3. [Entries dropped during a replay](#entries-dropped-during-a-replay)

## Subscribe first, then read

`followLog` subscribes to the event bus **before** it reads the first page. So every entry is
either in the log when a page is read, or published afterwards. While it replays, live entries are
ignored: the next page reads them from the log, in order. Once it caught up, `SeqCursor` drops an
entry the replay already read that the bus delivers late. This holds for any bus that delivers in
publish order (the `SpeechEventBus` contract).

```mermaid
sequenceDiagram
    participant R as SSE route<br/>(adapters/in/http)
    participant F as followLog
    participant Bus as SpeechEventBus
    participant Log as SpeechLog
    participant S as SpeechService

    R->>F: watch(since 40, session)
    F->>Bus: subscribe (replaying = true)
    F->>Log: page(after 40, 500)
    Log-->>F: seq 41..43, hasMore false
    S->>Log: append seq 44
    S->>Bus: publish entry 44
    Bus-->>F: entry 44: replaying, ignored
    F-->>R: entry 41, 42, 43 (cursor 43)
    F->>Log: page(after 43): seq 44
    F-->>R: entry 44 (cursor 44), replaying = false
    S->>Bus: publish entry 45
    Bus-->>F: entry 45: cursor.advance → new
    F-->>R: entry 45 (live)
    Note over F: a late duplicate of 44 from the bus:<br/>cursor.advance → false, dropped
```

## Pacing and backpressure

After each replayed entry, `followLog` calls `pace()`. A promise pauses the replay; it then reads
again from the cursor, because the log may have changed meanwhile. For SSE, `SseHub.pace` waits for
`drain` while the socket has unread data, and yields every 256 frames, so TCP capture and other
requests run in between. Only one page (500 entries) is held at a time.

```mermaid
sequenceDiagram
    participant TCP as TCP capture
    participant F as followLog
    participant H as SseHub.pace
    participant Res as ServerResponse

    loop each replayed entry
        F->>Res: write frame (through the route)
        F->>H: pace()
        alt res.writableNeedDrain
            H-->>F: promise: 'drain' or 'close'
            Note over F: paused
            TCP->>TCP: speech arrives, appended to the log
            Res-->>H: drain
            F->>F: page again from the cursor
        else every 256th frame
            H-->>F: setImmediate()
        else
            H-->>F: undefined (go on)
        end
    end
    Note over Res: live: more than 1 MiB queued for this client<br/>→ res.destroy(), the client reconnects with Last-Event-ID
```

## Entries dropped during a replay

The buffer keeps dropping its oldest entries while a slow replay runs. `SpeechLog.page` says
`truncated` when entries after the cursor are gone, and the reader gets a `truncated` event at
exactly that point, then the rest.

```mermaid
sequenceDiagram
    participant F as followLog
    participant Log as SpeechLog (maxEntries 1000)
    participant R as SSE stream

    F->>Log: page(after 0)
    Log-->>F: truncated (seq 1..99 dropped), seq 100..599
    F-->>R: event: truncated
    F-->>R: entries 100..599
    Note over F: paused (backpressure)
    Note over Log: 700 new entries: seq 600..699 dropped
    F->>Log: page(after 599)
    Log-->>F: truncated, seq 700..
    F-->>R: event: truncated
    F-->>R: entries 700.., then live
```
