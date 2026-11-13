# Configuration

All settings of the bridge: CLI flags, environment variables and the config file.

Precedence: **CLI flags > environment variables > config file > defaults**.

- Config file: `%APPDATA%\screenreader-speech-capture\config.json` (on Linux and macOS, for
  development: `$XDG_CONFIG_HOME` or `~/.config`, then `screenreader-speech-capture/config.json`).
  `--config <path>` / `SR_SPEECH_CONFIG` selects another file. It holds only the settings saved so
  far; everything else comes from the defaults.
- Environment variables: `SR_SPEECH_` + the flag name in upper snake case, for example
  `SR_SPEECH_TCP_PORT=4449`, `SR_SPEECH_HTTP_PORT=5151`, `SR_SPEECH_NO_MCP=1`. Switches
  (`SR_SPEECH_NO_MCP`, `SR_SPEECH_CONSOLE_SPEECH`, …) are on with `1`, `true`, `yes` or `on`;
  `0`, `false`, `no`, `off` or empty count as not set.
- The **Settings** page in the UI *(planned, [M5](ROADMAP.md#m5-web-ui-))* edits the configuration through `PUT /api/v1/config`.
- An invalid value stops the start with an error that names the flag, the variable or the config
  file, and the setting (exit code `2`).
- If a flag or variable sets something the config file also sets, the bridge log warns at startup:
  `[config] WARN tcp.port: the config file sets 4449, but SR_SPEECH_TCP_PORT sets 4450, which wins`.

```jsonc
{
  "tcp":        { "host": "127.0.0.1", "port": 4449, "format": "text-to-socket", "encoding": "windows-1252", "maxLineBytes": 65536 },
  "http":       { "host": "0.0.0.0",   "port": 5151 },
  "playwright": { "enabled": true, "port": 3000, "version": null },  // exact version, null = bundled
  "mcp":        { "enabled": true, "port": 8931 },                   // version: the bundled one
  "input":      { "enabled": true },
  "buffer":     { "maxEntries": 10000 },
  "log":        { "level": "info", "file": null, "consoleSpeech": false }  // bridge log, file null = default path
}
```

`tcp.format` selects the parser for the incoming wire format. `text-to-socket` (the default) reads
CRLF-terminated lines, with an optional header line, as described in [Wire format](speech-capture.md#wire-format).
`tcp.encoding` is the code page used to decode them (default `windows-1252`).
`log` is explained in [Operations](operations.md#logging).

## Changing settings

`PUT /api/v1/config` takes any subset of the settings, as JSON:

```sh
curl -X PUT $VM/api/v1/config -H 'content-type: application/json' -d '{"tcp":{"port":4450}}'
```

- The whole patch is checked first. An invalid value changes nothing and answers `400` with
  `details.field`.
- The change applies to the running bridge right away, then the patch is saved to the config file.
  The file keeps its own settings plus the patch, never values from flags or environment variables.
- If one part can't take the change (for example the new port is in use: `400`, `field:
  "tcp.port"`), the parts that already took it are undone and nothing is saved.
- Updates run one at a time, and every changed setting is logged under `[config]`.
- A flag or variable still wins on the **next start**. Changing such a setting works for the
  running bridge, and the log warns: `[config] WARN tcp.port: saved to …\config.json, but
  --tcp-port overrides it on the next start`.

What each section does when it changes:

| Section | Effect |
|---|---|
| `tcp` | The TCP listener restarts on the new settings, which closes the open connections. The voice reconnects on its next `Speak`. If the new port can't be used, the listener stays on the old one. |
| `http` | The API and UI move to the new address. A new port is bound before the old one closes, so a port in use leaves everything as it was. The answer to the `PUT` still comes from the old address; open SSE streams are closed (clients reconnect). |
| `buffer` | `maxEntries` applies at once. A smaller value drops the oldest entries (they count as `truncated`). |
| `log` | The level applies at once. A new `file` or `consoleSpeech` switches the log output. |
| `playwright` | The Playwright server restarts with the new port or version (a new version is installed first). The `PUT` answers at once; `status` shows the service as `starting` until it runs. `enabled: false` stops it. A change of `http.host` restarts it too, because it listens on the same interface. |
| `mcp` | Like `playwright`, for Playwright MCP. It has no `version`: the bridge runs the [bundled one](playwright-mcp.md#mcp-version). |
| `input` | Saved, and shown by `GET /config` and `status`. It takes effect once native input (M4) exists. |

## CLI flags

| Flag | Default | Description |
|---|---|---|
| `--tcp-host <addr>` | `127.0.0.1` | Interface for the speech TCP listener. The voice runs locally, so keep it on loopback. |
| `--tcp-port <n>` | `4449` | Port the socket voice connects to (the default voice of `text-to-socket-engine` uses 4449). |
| `--tcp-encoding <enc>` | `windows-1252` | Character encoding of the incoming text: the VM's ANSI code page (see [Wire format](speech-capture.md#wire-format)). |
| `--host <addr>` | `0.0.0.0` | Interface for HTTP, Playwright server and MCP (these are reached remotely). |
| `--http-port <n>` | `5151` | HTTP API (and the web UI, [M5](ROADMAP.md#m5-web-ui-)). |
| `--playwright-port <n>` | `3000` | Playwright server (WebSocket). |
| `--playwright-version <v>` | *(bundled)* | Playwright version of the server, exact (`1.65.0`). Must match the clients (see [Version](playwright-mcp.md#version)). |
| `--mcp-port <n>` | `8931` | Playwright MCP (HTTP). |
| `--no-playwright` | | Don't start the Playwright server. |
| `--no-mcp` | | Don't start Playwright MCP. |
| `--no-input` | | Disable the native input endpoints *(planned, [M4](ROADMAP.md#m4-native-input-))*. |
| `--log-level <level>` | `info` | Level of the bridge's own log: `error`, `warn`, `info`, `debug`. |
| `--bridge-log <path>` | `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log` | File for the bridge's own log (see [Operations](operations.md#logging)). |
| `--console-speech` | off | Also write the received speech to the console. Causes a feedback loop when the console is on the VM ([Operations](operations.md#speech-text-stays-off-the-console)). |
| `--config <path>` | `%APPDATA%\screenreader-speech-capture\config.json` | Use a different config file. |
| `-h`, `--help` / `-v`, `--version` | | Show the options / the version. |
