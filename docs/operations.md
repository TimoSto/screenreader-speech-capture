# Operations

How the bridge starts, stops and recovers, and what it logs. For where to run it, see
[VM setup](vm-setup.md#running-on-the-vm).

## Startup

The bridge starts in this order:

1. **Load the configuration** (flags > environment > config file > defaults). Invalid values stop
   the start with an error that names the flag, variable or config file and the setting (exit code
   `2`). A setting that a flag or variable takes over from the config file is logged as a warning.
2. **TCP listener** for the socket voice. It starts first so that no speech is lost while the rest
   is still starting. If the port is in use, the bridge exits (see
   [Speech capture](speech-capture.md#listening-and-connections)).
3. **HTTP server** (API + UI).
4. **Child services**: Playwright server and Playwright MCP, if enabled. They start in the
   background, so the API already answers meanwhile. If the configured Playwright version is not
   installed yet, it is installed first, which can take a minute or two
   ([Install](playwright-mcp.md#install)). A service is `running` once its port accepts
   connections (at most 60 seconds after its process started, or it counts as a crash).

`GET /api/v1/status` reports `bridge.state: "starting"` until each enabled service is running (or
has `failed`, so a broken service doesn't block forever: check its state), then `"ready"`. Requests that need a service that isn't running yet get `503 SERVICE_UNAVAILABLE`.
`screenreader-speech-capture-client status --wait-ready` waits for `ready`, which is useful as the
first step of a CI job.

## Shutdown

The bridge stops gracefully on Ctrl+C (`SIGINT`), Ctrl+Break (`SIGBREAK`, Windows), closing the
console window (`SIGHUP`) and `SIGTERM`. The bridge log names the signal
(`[bridge] INFO stopping (SIGINT)`). The bridge:

1. stops accepting new HTTP and TCP connections and ends open SSE streams and `wait` requests
   (they get `503`),
2. stops the child services and **kills their whole process tree**. On Windows, killing a process
   does not kill its children, so without this the browsers started by the Playwright server would
   stay open. The bridge uses `taskkill /T /F /PID <pid>`. On Linux and macOS each service runs in
   its own process group, which gets `SIGTERM` and, 3 seconds later, `SIGKILL`,
3. writes any buffered console output. The log file is written line by line as it goes, so it is
   always complete,
4. exits with code `0` (or `1` if something failed on the way).

If a shutdown step hangs, the bridge exits anyway after 10 seconds with code `1`. A second signal
while it stops (Ctrl+C again) exits at once with code `1`. A signal that arrives while the bridge
is still starting stops it as soon as it has started.

If the bridge crashes (an uncaught exception or unhandled promise rejection), the error and its
stack go into the bridge log, and the bridge stops as above and exits with code `1`.

Limits on Windows:

- Closing the console window gives a program about 5 seconds before Windows ends it, which is
  less than the 10-second limit above.
- At log off and system shutdown, Windows ends console programs without a signal, so the bridge
  cannot stop gracefully. Nothing is lost from the log file (see step 3).
- The child services are not tied to the bridge's process yet (a Windows job object). If the
  bridge is killed without a chance to stop (Task Manager, log off), the Playwright server and its
  browsers can stay behind. End them by hand or log off.

## Child service crashes

If the Playwright server or MCP exits unexpectedly:

- the bridge kills what is left of its process tree and restarts it with a growing delay (1 s,
  2 s, 4 s, … up to 30 s). A failed install counts as a crash too,
- `status` shows `state: "crashed"`, the `exitCode` (`null` when it was killed by a signal or
  could not start) and `restarts` (restarts since the last start by hand),
- after **5 crashes in a row** (without 60 seconds of stable running in between), it stops trying.
  The state stays `"failed"` until it is restarted by hand (`POST /api/v1/services/<name>/restart`
  or the UI),
- the service's output is in the bridge log, line by line, and a `[bridge]` line says how it
  ended: `[bridge] ERROR playwright exited with code 1, restart 2 in 2 s`.

Speech capture and the HTTP API keep working while a child service is down.

## Logging

The **bridge log** records what the bridge itself does: start/stop, TCP connects/disconnects,
config changes, warnings (cut lines), errors and child service output. Settings: `--bridge-log
<path>` / `log.file`, `--log-level` / `log.level`. The recorded speech itself lives in the
in-memory [buffer](speech-capture.md#buffer).

Bridge log details:

- written to the console **and** to a file. The default file is
  `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log`. The first line always shows the
  version, the log level and the file, whatever the level is,
- levels: `error`, `warn`, `info` (default), `debug`. `debug` also logs every received line and
  every HTTP request,
- the file is rotated at 10 MB, and the last 5 files are kept.

### Speech text stays off the console

At `debug`, the received lines (what the screen reader said) go **only to the log file**, never to
the console. On the VM, the screen reader reads new text in the focused console. If the console
showed the speech, that text would be spoken through the socket voice, recorded, logged and read
again, in an endless loop.

`--console-speech` / `log.consoleSpeech` (env `SR_SPEECH_CONSOLE_SPEECH=1`) also writes the speech
to the console. Only use it when the console is **not** on the VM's desktop, for example over SSH.

### Line format

Every line starts with a **prefix** in square brackets that names the part of the bridge it comes
from. Prefixes are padded with spaces to the length of the longest one, so the rest of the line
always starts in the same column:

```
[bridge]            2026-11-07T14:03:10.002Z INFO  starting, version 0.3.0, config C:\Users\test\AppData\Roaming\screenreader-speech-capture\config.json
[speech-capture]    2026-11-07T14:03:10.015Z INFO  listening on 127.0.0.1:4449, encoding windows-1252
[http-api]          2026-11-07T14:03:10.031Z INFO  listening on 0.0.0.0:5151, reachable at http://192.168.122.57:5151, http://localhost:5151
[playwright-server] 2026-11-07T14:03:11.410Z INFO  Listening on ws://0.0.0.0:3000/
[playwright-mcp]    2026-11-07T14:03:11.622Z INFO  Listening on http://0.0.0.0:8931
[bridge]            2026-11-07T14:03:11.623Z INFO  ready
[speech-capture]    2026-11-07T14:03:12.345Z INFO  connection 3 opened (voice=null)
[native-input]      2026-11-07T14:03:15.100Z INFO  keys Insert+T
[playwright-server] 2026-11-07T14:03:20.733Z ERROR browserType.launch: Executable doesn't exist
```

On `0.0.0.0` (the default `--host`), the `http-api` line lists the URLs the API can be reached at:
the machine's IPv4 addresses, then `localhost`. Use one of them as the client's
[bridge URL](client.md#bridge-url).

After the prefix comes the timestamp (ISO 8601, UTC), the level (padded to 5 characters) and the
message.

| Prefix | Colour (console) | Source |
|---|---|---|
| `[bridge]` | bold white | Startup, shutdown, service supervision (restarts, crashes) |
| `[config]` | grey | Loading and changing the configuration |
| `[speech-capture]` | green | TCP listener: connections, cut lines, received lines (`debug`, file only, see above) |
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
