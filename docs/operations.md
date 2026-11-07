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
3. writes any buffered lines of the utterance log and the bridge log to disk,
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

The bridge writes two different logs. Don't confuse them:

| Log | Content | Setting |
|---|---|---|
| **Utterance log** | Every utterance and marker, one JSON object per line (JSONL). For keeping a record of what was said. | `--utterance-log <path>` / `utteranceLog.file`. Off by default. |
| **Bridge log** | What the bridge itself does: start/stop, TCP connects/disconnects, config changes, warnings (cut lines, encoding fallback), errors, child service output. | `--bridge-log <path>` / `log.file`, `--log-level` / `log.level` |

Bridge log details:

- written to the console **and** to a file. The default file is
  `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log`,
- levels: `error`, `warn`, `info` (default), `debug`. `debug` also logs every received line and
  every HTTP request,
- one line per entry: `2026-11-07T14:03:12.345Z INFO  [tcp] connection 3 opened (voice=null)`,
- output of the child services is added with a prefix (`[playwright]`, `[mcp]`),
- the file is rotated at 10 MB, and the last 5 files are kept.

## Restarting the bridge

Utterances live in memory, so a restart empties the buffer. `seq` starts again at 1, and clients
that kept a cursor have to `clear()` again. The socket voice reconnects by itself on its next
`Speak` call (it retries a failed send once), so the screen reader doesn't need to be restarted.
