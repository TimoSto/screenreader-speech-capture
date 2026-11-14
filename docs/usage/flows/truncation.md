# Truncation flows

What happens when speech a reader asks for has already been dropped from the bridge's full buffer.
The buffer rules are in [Speech capture → Buffer](../speech-capture.md#buffer), the client's errors
in [Test client → Errors](../client.md#errors). The fix is always the same: raise
`buffer.maxEntries` ([Configuration](../configuration.md)) or read more often.

**Contents**

1. [The buffer drops the oldest entry](#the-buffer-drops-the-oldest-entry)
2. [Reading a range with a gap](#reading-a-range-with-a-gap)
3. [A wait times out after a gap](#a-wait-times-out-after-a-gap)
4. [A stream replay with a gap](#a-stream-replay-with-a-gap)
5. [record() with a gap](#record-with-a-gap)
6. [The CLI with a gap](#the-cli-with-a-gap)

## The buffer drops the oldest entry

The buffer holds at most `buffer.maxEntries` entries (default 10 000). Each new entry beyond that
drops the oldest one, and `buffer.firstSeq` moves up. A smaller `maxEntries` set through
`PUT /config` drops the oldest entries at once. Entries removed by a clear don't count as dropped.

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS<br/>+ socket voice
    participant B as Bridge :5151<br/>(maxEntries 3)
    participant C as Client

    SR->>B: seq 1, 2, 3
    Note over B: buffer: 1 2 3
    SR->>B: seq 4
    Note over B: seq 1 dropped, buffer: 2 3 4
    C->>B: GET /api/v1/status
    B-->>C: buffer.firstSeq 2, lastSeq 4
```

## Reading a range with a gap

`GET /speech` sets `truncated: true` when entries after `since` were dropped. The client library
turns that into `SpeechTruncatedError`, so an assertion never runs on a transcript with a gap;
`allowTruncated: true` returns what is left instead.

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151<br/>(buffer: seq 2..4)

    T->>C: getText({ since: 0 })
    C->>B: GET /api/v1/speech?since=0
    B-->>C: 200 entries seq 2..4, truncated: true
    alt default
        C-->>T: SpeechTruncatedError (entries: seq 2..4,<br/>message suggests raising buffer.maxEntries)
    else allowTruncated: true
        C-->>T: text of seq 2..4
    end
```

## A wait times out after a gap

A match may have been among the dropped entries. A match found anyway is still a match; only a
timeout reports the gap, as `SpeechTimeoutError.truncated`.

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151<br/>(buffer: seq 2..4)

    T->>C: waitForOutput("Submit", { since: 0 })
    C->>B: GET /api/v1/speech?since=0
    B-->>C: entries seq 2..4, truncated: true, no match
    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 4
    Note over C: timeout, still no match
    C-->>T: SpeechTimeoutError, truncated: true<br/>(the match may have been dropped)
```

## A stream replay with a gap

When a reconnect asks for entries that are already gone, the replay starts with a `truncated`
event. Entries dropped while a slow replay runs bring another `truncated` event at that point.
`onSpeech` reports both to `onTruncated`. Details: [Endpoints](../http-api.md#endpoints).

```mermaid
sequenceDiagram
    participant C as Client<br/>(onSpeech)
    participant B as Bridge :5151<br/>(buffer: seq 2..4)

    C->>B: GET /api/v1/speech/stream<br/>Last-Event-ID: 0
    B-->>C: event: truncated (seq 1 is gone)
    Note over C: onTruncated()
    B-->>C: event: entry seq 2, 3, 4 (replay)
    Note over B: speech keeps arriving fast,<br/>seq 5 is dropped before the replay reaches it
    B-->>C: event: truncated
    B-->>C: event: entry seq 6, … then live
```

## record() with a gap

`record(fn)` doesn't throw: it returns what is left with `truncated: true`, so the test decides.

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151

    T->>C: record(fn)
    Note over C: fn runs, the screen reader says a lot,<br/>the buffer drops entries of this recording
    C->>B: GET /api/v1/speech?since=start
    B-->>C: entries (incomplete), truncated: true
    C-->>T: { result, entries, truncated: true }
```

## The CLI with a gap

`speech` and `text` print what is left, warn on stderr and still exit `0`; with `--json` the
answer has `"truncated": true`. `wait` reports it on a timeout, `tail --json` prints a
`{"type":"truncated"}` line. Details: [CLI for agents](../client.md#cli-for-agents).

```mermaid
sequenceDiagram
    participant A as Agent / script
    participant CLI as client CLI
    participant B as Bridge :5151

    A->>CLI: text --json
    CLI->>B: GET /api/v1/speech?session=current
    B-->>CLI: entries, truncated: true
    CLI-->>A: stdout: {"text": …, "truncated": true}<br/>stderr: warning, exit code 0
    A->>CLI: wait "Submit" --json
    CLI->>B: read the buffer, follow the stream
    CLI-->>A: {"matched": false, "entries": […], "truncated": true}, exit code 1
```
