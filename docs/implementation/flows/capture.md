# Capture flows

Sequence diagrams of how speech gets from the socket voice into the bridge's speech log and out to
the readers. The rules are in [TCP capture](../tcp-capture.md) and
[Speech capture → Wire format](../../usage/speech-capture.md#wire-format).

**Contents**

1. [The socket voice connects and speaks](#the-socket-voice-connects-and-speaks)
2. [Framing and decoding](#framing-and-decoding)
3. [From line to readers](#from-line-to-readers)

## The socket voice connects and speaks

The engine is the TCP client and connects lazily, on the first text it has to speak. Each speaking
process opens its own connection. A `tcpHeader` arrives as the first line; nothing marks it as a
header except the `voice=<id>` form the parser looks for.

```mermaid
sequenceDiagram
    participant SR as NVDA / JAWS
    participant E as text-to-socket-engine<br/>(SAPI 5 voice)
    participant L as TcpListener<br/>(adapters/in/tcp)

    SR->>E: Speak("Submit, button")
    E->>L: TCP connect 127.0.0.1:4449
    L->>L: connectionId 3, logged, listed in status
    E->>L: "voice=ssc5000\r\n" (only if a tcpHeader is set)
    E->>L: "Submit, button\r\n" (fragments joined with a space, ANSI code page)
    SR->>E: Speak("Name, edit")
    E->>L: "Name, edit\r\n" (same connection)
    Note over E,L: the connection closes: normal,<br/>the engine reconnects on its next Speak
    alt the bridge isn't listening
        E--xL: send fails, one reconnect + retry, then the text is dropped silently
    end
```

## Framing and decoding

Per connection, `text-to-socket-parser` cuts the bytes at `\n` before decoding, so a multi-byte
character split across TCP packets still decodes correctly.

```mermaid
sequenceDiagram
    participant S as TCP socket
    participant P as Parser (per connection)
    participant R as RecordSpeech

    S->>P: bytes "Subm"
    Note over P: no \n yet, kept in the byte buffer
    S->>P: bytes "it, button\r\n\r\nName"
    P->>P: cut at \n, drop trailing \r, decode with tcp.encoding
    P->>R: "Submit, button" (voice, connectionId)
    P->>P: empty line skipped (SAPI pause)
    Note over P: "Name" waits for its \n
    S->>P: more than tcp.maxLineBytes without \n
    P->>P: line cut, warning logged
    S->>P: connection closed
    P->>R: "Name…" (text left in the buffer is a final entry)
```

## From line to readers

`RecordSpeech` gives the line its `seq` and `receivedAt` (from the `Clock` port), the `SpeechLog`
stores it (dropping the oldest entry when full) and the event bus hands it to every reader.

```mermaid
sequenceDiagram
    participant P as Parser
    participant S as SpeechService<br/>(RecordSpeech)
    participant Log as SpeechLog (domain)
    participant Bus as Event bus (out/memory)
    participant SSE as SSE streams
    participant W as Waits (follow-log)
    participant T as TranscriptService

    P->>S: record(text, voice, connectionId)
    S->>Log: append (next seq, clock.now(), current sessionId)
    Log-->>S: entry (oldest entry dropped if the buffer was full)
    S->>Bus: publish entry
    Bus-->>SSE: event: entry
    Bus-->>W: check the match
    Bus-->>T: at debug: the line to the log file<br/>(console only with --console-speech)
```
