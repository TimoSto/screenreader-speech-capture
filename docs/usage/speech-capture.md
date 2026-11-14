# Speech capture

What the socket voice sends, and how the bridge keeps the speech entries: buffer and sessions.

Flows: [sessions](flows/http.md#one-session-per-test), [truncation](flows/truncation.md), [capture internals](../implementation/flows/capture.md).

## Wire format

From the engine's source (`ttsengobj.cpp`):

- **The engine is the TCP client** and the bridge is the server. The engine connects lazily on the
  first text it has to speak. If a send fails it reconnects and retries once. Otherwise the text is
  dropped without an error, so **start the bridge before the screen reader speaks**.
- Each SAPI instance (each speaking process) opens **its own connection**. The bridge accepts many
  connections at the same time.
- If a `tcpHeader` is set, it is sent once right after connecting, followed by `\r\n`. Nothing
  marks it as a header: on the wire it looks like any other line.
- Each SAPI `Speak` call becomes **one line**: the text fragments joined with a single space,
  ended by `\r\n`. The bridge records one speech entry per line.
- The text is converted with the system **ANSI code page**, not UTF-8. Characters that the code
  page can't represent arrive as `?`. The bridge decodes with `--tcp-encoding`, default
  `windows-1252` (English and Western European Windows). On a VM with another code page, set it to
  match, for example `shift_jis`, or `utf-8` with the "Use Unicode UTF-8" beta setting. The VM's
  code page is in `HKLM\SYSTEM\CurrentControlSet\Control\Nls\CodePage\ACP`.
- SSML/XML markup and bookmarks are not forwarded, only the spoken text.
- The engine sends no timing or audio information. `receivedAt` is the time the bridge received
  the line.
- Text is sent when the screen reader *asks* for it to be spoken. Speech that the screen reader
  interrupts or cancels a moment later (for example when you press the next key) is still recorded.
  The recording shows what was **sent to speech**, which can be more than a listener would hear.

How the bridge listens, frames and decodes those lines is in
[TCP capture](../implementation/tcp-capture.md).

## Buffer

The buffer is an in-memory list, oldest first, with at most `buffer.maxEntries` entries (default
10 000). When it is full, the oldest entry is dropped for each new one. `GET /api/v1/status`
reports `buffer.firstSeq` and `buffer.lastSeq`. If entries after a request's `since` were dropped
this way, the response has `"truncated": true`, so a test can tell that it missed something.
Entries removed by a clear don't count.

## Sessions

A session groups the speech of one test or one agent task, so the [web UI](web-ui.md#context-pane)
and readers can tell them apart.

- The socket voice sends only text, nothing about who caused it. So there is **one current session
  at a time**. `POST /api/v1/sessions` starts a session with a `name` (for example the test title)
  and an optional `run` label (for example one label per Playwright run). The new session becomes
  current, and the previous one ends.
- Every entry recorded while a session is current gets its `sessionId`, markers included.
  Entries outside any session (before the first one, or after `POST /api/v1/sessions/end`) have
  `sessionId: null`. Reads with `session=none` return only those ([HTTP API](http-api.md#data-model)).
- Session `id`s increase and restart at 1 with the bridge (unlike `seq`, which keeps rising).
- Two clients (for example two Playwright workers) can't share the screen reader: each new
  session ends the other one's. The bridge doesn't lock sessions, but it warns when a client
  ends or replaces another client's session ([Clients](http-api.md#clients)).
- **Sessions replace clearing between tests.** The [fixture](client.md#playwright-fixture) *(planned, [M3](../ROADMAP.md#m3-playwright--mcp-))*
  starts one session per test, and agents start one per task. Reads are scoped to the current session, so
  earlier sessions stay in the buffer and stay visible in the UI.
- Sessions share the capped buffer: an ended session disappears from the session list once all
  its entries have been dropped. `DELETE /api/v1/speech` is a **global wipe** for manual use: it
  removes all entries and all ended sessions. The current session stays current, empty.
- Sessions live in memory only, like the buffer.

Endpoints: [HTTP API](http-api.md#endpoints).
