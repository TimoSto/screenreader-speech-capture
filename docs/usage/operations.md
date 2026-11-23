# Operations

How the bridge starts, stops and recovers, and what it logs. For where to run it, see
[VM setup](vm-setup.md#running-on-the-vm).

Flows: [startup and shutdown](../implementation/flows/lifecycle.md), [child services](../implementation/flows/child-services.md).

## Startup

The bridge starts in this order:

1. **Load the configuration** (flags > environment > config file > defaults). Invalid values stop
   the start with an error that names the flag, variable or config file and the setting (exit code
   `2`). A setting that a flag or variable takes over from the config file is logged as a warning.
2. **TCP listener** for the socket voice. It starts first so that no speech is lost while the rest
   is still starting. If the port is in use, the bridge exits (see
   [Speech capture](../implementation/tcp-capture.md#listening-and-connections)).
3. **HTTP server** (API + UI).
4. **Child services**: Playwright server and Playwright MCP, if enabled. They start in the
   background, so the API already answers meanwhile. If the configured Playwright version or a
   service's Chromium is not installed yet, it is installed first, which can take a minute or two
   ([Install](playwright-mcp.md#install)). A service is `running` once its port accepts
   connections (at most 60 seconds after its process started, or it counts as a crash).

`GET /api/v1/status` reports `bridge.state: "starting"` until each enabled service is running (or
has `failed`, so a broken service doesn't block forever: check its state), then `"ready"`.
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
   stay open. The bridge uses `taskkill /T /F /PID <pid>`, limited to 5 seconds. On Linux
   and macOS each service runs in its own process group, which gets `SIGTERM` and, 3 seconds
   later, `SIGKILL`,
3. writes any buffered console output. The log file is written line by line as it goes, so it is
   always complete,
4. exits with code `0` (or `1` if something failed on the way).

If a shutdown step hangs, the bridge exits anyway after 10 seconds with code `1`. A second signal
while it stops (Ctrl+C again) exits at once with code `1`. A signal that arrives while the bridge
is still starting stops it as soon as it has started. Both ways of exiting early first kill the
child services' process trees, so the Playwright server's browsers don't stay behind.

If the bridge crashes (an uncaught exception or unhandled promise rejection), the error and its
stack go into the bridge log, and the bridge stops as above and exits with code `1`.

Limits on Windows:

- Closing the console window gives a program about 5 seconds before Windows ends it, which is
  less than the 10-second limit above.
- At log off and system shutdown, Windows ends console programs without a signal, so the bridge
  cannot stop gracefully. Nothing is lost from the log file (see step 3).
- The child services are not tied to the bridge's process (no Windows job object, see
  [decisions](../implementation/decisions.md#child-process-trees-are-killed-by-the-bridge-not-the-os)).
  If the bridge is killed without a chance to stop (Task Manager, log off), the Playwright server
  and its browsers can stay behind. End them by hand or log off; the next start refuses to use a
  port they still hold and says so in the log.

## Child service crashes

If the Playwright server or MCP exits unexpectedly:

- the bridge kills what is left of its process tree and restarts it with a growing delay (1 s,
  2 s, 4 s, … up to 30 s). A failed install counts as a crash too, and so does an install that
  takes longer than 10 minutes (it is killed with everything it started),
- a service never starts while something else already answers on its port (a leftover process of
  an earlier run, another program). That counts as a crash, with the log line
  `playwright: port 3000 is already in use`, instead of passing for a running service,
- `status` shows `state: "crashed"`, the `exitCode` (`null` when it was killed by a signal or
  could not start) and `restarts` (restarts since the service was last started),
- after **5 crashes in a row** (without 60 seconds of stable running in between), it stops trying.
  The state stays `"failed"` until the bridge restarts,
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
  `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log`. The first lines always show the
  version, the config, the log level and the file, whatever the level is,
- levels: `error`, `warn`, `info` (default), `debug`. `debug` also logs every received line and
  every HTTP request,
- the file is rotated at 10 MB, and the last 5 files are kept.
- console output is written by a separate thread, so a console that blocks (on Windows, while text is
  selected in its window) can't stop the bridge. While it is blocked, up to 1 MiB of lines wait,
  then more are dropped (the file keeps all of them) and one line tells how many.

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
[bridge]            2026-11-07T14:03:10.002Z INFO  version 0.3.0
[bridge]            2026-11-07T14:03:10.002Z INFO  config  C:\Users\test\AppData\Roaming\screenreader-speech-capture\config.json
[bridge]            2026-11-07T14:03:10.002Z INFO  log     level info, file C:\Users\test\AppData\Local\screenreader-speech-capture\logs\bridge.log
[bridge]            2026-11-07T14:03:10.002Z INFO  speech text is logged at debug
[bridge]            2026-11-07T14:03:10.050Z INFO  starting playwright 1.65.0
[bridge]            2026-11-07T14:03:10.050Z INFO  starting mcp 0.0.85
[bridge]            2026-11-07T14:03:11.497Z INFO  playwright running (1.4s)
[bridge]            2026-11-07T14:03:11.623Z INFO  mcp running (1.6s)
[bridge]            2026-11-07T14:03:11.624Z INFO  ready in 1.6s
[bridge]            2026-11-07T14:03:11.624Z INFO    speech capture     127.0.0.1:4449 (windows-1252)
[bridge]            2026-11-07T14:03:11.624Z INFO    HTTP API + web UI  http://192.168.122.57:5151, http://localhost:5151
[bridge]            2026-11-07T14:03:11.624Z INFO    Playwright server  ws://192.168.122.57:5151/playwright, ws://localhost:5151/playwright (1.65.0)
[bridge]            2026-11-07T14:03:11.624Z INFO    Playwright MCP     http://192.168.122.57:5151/playwright-mcp, http://localhost:5151/playwright-mcp (0.0.85)
[bridge]            2026-11-07T14:03:11.624Z INFO    native input       robotjs
[speech-capture]    2026-11-07T14:03:12.345Z INFO  connection 1 opened
[native-input]      2026-11-07T14:03:15.100Z INFO  keys Insert+T
[playwright-server] 2026-11-07T14:03:20.733Z ERROR browserType.launch: Executable doesn't exist
```

The block after `ready in …` is the summary of what runs where, and the one place with the URLs.
On `0.0.0.0` (the default `--host`) it lists the machine's IPv4 addresses, then `localhost`. Use
its URLs: the `HTTP API` row for the client's [bridge URL](client.md#bridge-url) (`HTTP API + web
UI` when the web UI is served), the `Playwright server` row (`ws://`) as the `wsEndpoint`, the
`Playwright MCP` row for MCP clients. A row reads `off (disabled in the config)` for a disabled
service and `FAILED, see the log above` for one that did not start. Native input shows `off` when
robotjs could not be loaded (a `WARN` line gives the reason).

These are `debug`, so `--log-level debug` shows them: the `listening on …` lines of the TCP and
HTTP listeners and the URL of each proxied path (the summary has the same addresses), the
`Listening on …` lines of the child services and the start banner of MCP (loopback ports only the
bridge uses), the Chromium check before each start, and every `connection … opened` after the
first (a voice that reconnects for every phrase).

After the prefix comes the timestamp (ISO 8601, UTC), the level (padded to 5 characters) and the
message.

| Prefix | Colour (console) | Source |
|---|---|---|
| `[bridge]` | bold white | Startup, shutdown, service supervision (restarts, crashes) |
| `[config]` | grey | Loading and changing the configuration |
| `[speech-capture]` | green | TCP listener: connections, cut lines, received lines (`debug`, file only, see above) |
| `[http-api]` | blue | HTTP server and requests (`debug`), SSE clients |
| `[web-ui]` | bright cyan | The web UI (errors only: it failed to start, or its server code hit an unexpected error, logged with the path but never the query) |
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

Speech entries and [sessions](speech-capture.md#sessions) live in memory, so a restart empties the
buffer and the session list. `seq` keeps rising ([HTTP API](http-api.md#data-model)), so clients
that kept a cursor or a live feed go on with the new run's speech. Session ids start again at 1:
start a new session. The socket voice reconnects by itself on its next
`Speak` call (it retries a failed send once), so the screen reader doesn't need to be restarted.
