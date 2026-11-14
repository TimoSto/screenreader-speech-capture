# TCP capture

How the bridge turns the bytes from the socket voice into speech entries
(`adapters/in/tcp/` → `RecordSpeech`). What the voice sends is in
[Speech capture → Wire format](../usage/speech-capture.md#wire-format).

Flows: [Capture flows](flows/capture.md).

## Listening and connections

- The bridge listens on `tcp.host:tcp.port` (default `127.0.0.1:4449`) and accepts any number of
  connections at the same time. Each one gets an increasing `connectionId`.
- Connections are listed in `GET /api/v1/status` (`tcp.connections`) while they are open, and
  connects and disconnects are logged. A connection that closes is normal: the engine opens a new one
  the next time it speaks.
- If the port is already in use (for example by a second bridge), the bridge **exits with an error**.
  It doesn't silently pick another port, because the voice only knows its configured port.
- `tcp.*` changed through `PUT /api/v1/config` takes effect on the next start of the bridge
  ([Changing settings](../usage/configuration.md#changing-settings)). The engine then reconnects
  on its next `Speak` call.

## Framing and decoding

Per connection, the `text-to-socket` parser:

1. collects the incoming **bytes** in a buffer and cuts it at `\n` (a trailing `\r` is removed).
   Bytes are split *before* decoding, so a multi-byte character (UTF-8 code page) that is split
   across two TCP packets is still decoded correctly,
2. decodes each complete line with `tcp.encoding` (default `windows-1252`),
3. handles the **first line** of a connection specially: if it matches `voice=<id>`, it is taken as
   the voice header and not recorded. Otherwise it is speech, and `voice` stays `null`,
4. **skips** lines that are empty or contain only whitespace (SAPI sends these for pauses),
5. cuts lines longer than `tcp.maxLineBytes` (default 64 KiB) and logs a warning, so a broken
   sender can't use up memory,
6. records a text that is still in the buffer when the connection closes as a final speech entry.

## From line to speech entry

For each line, the TCP listener calls `RecordSpeech` with the text, the connection's voice and its
`connectionId`. `RecordSpeech`:

- assigns the next `seq` and takes `receivedAt` from the clock when the line is complete (the engine sends no timestamps of its own),
- stores the entry in the buffer and publishes it on the event bus (SSE stream, waiting
  `wait` requests, UI).

Entries from different connections are ordered by when the bridge received them. The bridge
doesn't try to merge entries: one `Speak` call is one entry.

