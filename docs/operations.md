# Operations

How the bridge starts, stops and recovers, and what it logs. For where to run it, see
[VM setup](vm-setup.md#running-on-the-vm).

## Startup

The bridge starts in this order:

1. **Load the configuration** (flags > environment > config file > defaults). Invalid values stop
   the start with an error that names the setting.
2. **TCP listener** for the socket voice. It starts first so that no speech is lost while the rest
   is still starting. If the port is in use, the bridge exits (see
   [Speech capture](speech-capture.md#listening-and-connections)).
3. **HTTP server** (API + UI).
4. **Child services**: Playwright server and Playwright MCP, if enabled. If the configured
   Playwright version is not installed yet, it is installed first, which can take a minute.

`GET /api/v1/status` reports `bridge.state: "starting"` until all enabled services are running,
then `"ready"`. Requests that need a service that isn't running yet get `503 SERVICE_UNAVAILABLE`.
`screenreader-speech-capture-client status --wait-ready` waits for `ready`, which is useful as the
first step of a CI job.

## Shutdown

On Ctrl+C, closing the console window, or Windows log off / shutdown, the bridge:

1. stops accepting new HTTP and TCP connections and ends open SSE streams and `wait` requests
   (they get `503`),
2. stops the child services and **kills their whole process tree**. On Windows, killing a process
   does not kill its children, so without this the browsers started by the Playwright server would
   stay open. The bridge uses `taskkill /T /F /PID <pid>`,
3. writes any buffered lines of the bridge log to disk,
4. exits with code `0` (or `1` if something failed on the way).

If a shutdown step hangs, the bridge exits anyway after 10 seconds.

## Child service crashes

If the Playwright server or MCP exits unexpectedly:

- the bridge restarts it with a growing delay (1 s, 2 s, 4 s, … up to 30 s),
- `status` shows `state: "crashed"`, the exit code and `restarts` (number of restarts so far),
- after **5 crashes in a row** (without 60 seconds of stable running in between), it stops trying.
  The state stays `"failed"` until it is restarted by hand (`POST /api/v1/services/<name>/restart`
  or the UI),
- the last lines of the service's output are in the bridge log.

Speech capture and the HTTP API keep working while a child service is down.

## Logging

The **bridge log** records what the bridge itself does: start/stop, TCP connects/disconnects,
config changes, warnings (cut lines), errors and child service output. Settings: `--bridge-log
<path>` / `log.file`, `--log-level` / `log.level`. The speech itself is not written to a file. It
lives in the in-memory [buffer](speech-capture.md#buffer).

Bridge log details:

- written to the console **and** to a file. The default file is
  `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log`,
- levels: `error`, `warn`, `info` (default), `debug`. `debug` also logs every received line and
  every HTTP request,
- the file is rotated at 10 MB, and the last 5 files are kept.

### Line format

Every line starts with a **prefix** in square brackets that names the part of the bridge it comes
from. Prefixes are padded with spaces to the length of the longest one, so the rest of the line
always starts in the same column:

```
[bridge]            2026-11-07T14:03:10.002Z INFO  starting, version 0.3.0, config C:\Users\test\AppData\Roaming\screenreader-speech-capture\config.json
[speech-capture]    2026-11-07T14:03:10.015Z INFO  listening on 127.0.0.1:4449, encoding windows-1252
[http-api]          2026-11-07T14:03:10.031Z INFO  listening on 0.0.0.0:5151
[playwright-server] 2026-11-07T14:03:11.410Z INFO  Listening on ws://0.0.0.0:3000/
[playwright-mcp]    2026-11-07T14:03:11.622Z INFO  Listening on http://0.0.0.0:8931
[bridge]            2026-11-07T14:03:11.623Z INFO  ready
[speech-capture]    2026-11-07T14:03:12.345Z INFO  connection 3 opened (voice=null)
[native-input]      2026-11-07T14:03:15.100Z INFO  keys Insert+T
[playwright-server] 2026-11-07T14:03:20.733Z ERROR browserType.launch: Executable doesn't exist
```

After the prefix comes the timestamp (ISO 8601, UTC), the level (padded to 5 characters) and the
message.

| Prefix | Colour (console) | Source |
|---|---|---|
| `[bridge]` | bold white | Startup, shutdown, service supervision (restarts, crashes) |
| `[config]` | grey | Loading and changing the configuration |
| `[speech-capture]` | green | TCP listener: connections, cut lines, encoding fallback, received lines (`debug`) |
| `[http-api]` | blue | HTTP server and requests (`debug`), SSE clients |
| `[native-input]` | magenta | Clicks and key presses |
| `[playwright-server]` | cyan | Output of the Playwright server child process |
| `[playwright-mcp]` | bright blue | Output of the Playwright MCP child process |

Levels have their own colours: `ERROR` red, `WARN` yellow, `INFO` default, `DEBUG` grey. Red and
yellow are not used for prefixes, so errors and warnings stand out.

Rules:

- The padding width is the length of the longest prefix in this table (`[playwright-server]`,
  19 characters) plus one space. It is fixed, not computed from the lines written so far, so every
  line in the console and in the file lines up.
- Output of the child processes is read line by line. Each line gets the prefix of its service
  (stdout as `INFO`, stderr as `WARN`), so a multi-line stack trace stays aligned.
- Messages never contain line breaks of their own. Line breaks inside a message (for example an
  error stack) are written as separate lines with the same prefix, timestamp and level.
- Colours use the standard 16 ANSI colours, so they work in Windows Terminal, the classic console
  (Windows 10+) and CI logs. Only the prefix (including its brackets) and the level are coloured,
  not the message.
- Colours are only written to the **console**, and only when it is a terminal. The log file never
  contains colour codes. `NO_COLOR=1` turns colours off, `FORCE_COLOR=1` turns them on even when
  the output is not a terminal (for example in CI). The padding is counted without colour codes,
  so alignment doesn't change.

## Restarting the bridge

Speech entries live in memory, so a restart empties the buffer. `seq` starts again at 1, and clients
that kept a cursor have to `clear()` again. The socket voice reconnects by itself on its next
`Speak` call (it retries a failed send once), so the screen reader doesn't need to be restarted.
