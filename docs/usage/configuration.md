# Configuration

All settings of the bridge: CLI flags, environment variables and the config file.

Flows: [changing settings](flows/http.md#change-the-configuration), [through the layers](../implementation/flows/config.md).

Precedence: **CLI flags > environment variables > config file > defaults**.

- Config file: `%APPDATA%\screenreader-speech-capture\config.json` (on Linux and macOS, for
  development: `$XDG_CONFIG_HOME` or `~/.config`, then `screenreader-speech-capture/config.json`).
  `--config <path>` / `SR_SPEECH_CONFIG` selects another file. It holds only the settings saved so
  far; everything else comes from the defaults.
- The file may start with a UTF-8 byte order mark (Notepad and PowerShell add one). Each save is flushed to disk;
  the previous file stays next to it as `config.json.bak`, and the bridge falls back on it when the file is empty or broken.
- Environment variables: `SR_SPEECH_` + the flag name in upper snake case, for example
  `SR_SPEECH_TCP_PORT=4449`, `SR_SPEECH_HTTP_PORT=5151`, `SR_SPEECH_NO_MCP=1`. Switches
  (`SR_SPEECH_NO_MCP`, `SR_SPEECH_CONSOLE_SPEECH`, …) are on with `1`, `true`, `yes` or `on`;
  `0`, `false`, `no`, `off` or empty count as not set.
- The **Settings** page of the [web UI](web-ui.md#settings) edits the TCP port, the text encoding, the speech buffer size, the Playwright server, the Playwright version, Playwright MCP and the log level through `PUT /api/v1/config`; [the other settings](web-ui.md#settings-without-a-field) have no field.
- An invalid value stops the start with an error that names the flag, the variable or the config
  file, and the setting (exit code `2`).
- If a flag or variable sets something the config file also sets, the bridge log warns at startup:
  `[config] WARN tcp.port: the config file sets 4449, but SR_SPEECH_TCP_PORT sets 4450, which wins`.

```jsonc
{
  "tcp":        { "host": "127.0.0.1", "port": 4449, "encoding": "windows-1252", "maxLineBytes": 65536 },
  "http":       { "host": "0.0.0.0",   "port": 5151, "allowedHosts": [] },  // more host names, see Security
  "playwright": { "enabled": true, "port": 3000, "version": null },  // loopback port; exact version, null = bundled
  "mcp":        { "enabled": true, "port": 8931 },                   // loopback port; version: the bundled one
  "buffer":     { "maxEntries": 10000 },
  "log":        { "level": "info", "file": null, "consoleSpeech": false }  // bridge log, file null = default path
}
```

The TCP listener reads CRLF-terminated lines, with an optional header line, as described in
[Wire format](speech-capture.md#wire-format). `tcp.encoding` (any `TextDecoder` label except `utf-16*`, since lines are split on bytes) is the code page used to decode them
(default `windows-1252`).
The ports of `tcp`, `http` and the enabled child services (`playwright`, `mcp`) must differ, and
the child services need a real port (`1`–`65535`, not `0`): the bridge refuses such a
configuration at start and in `PUT /config` (`INVALID_REQUEST`, naming the second setting).
`log` is explained in [Operations](operations.md#logging). `http.allowedHosts` lists host names
the API answers to besides IP addresses, `localhost` and the machine's name, see
[Host and origin](security.md#host-and-origin).

## Changing settings

`PUT /api/v1/config` takes any subset of the settings, as JSON:

```sh
curl -X PUT $VM/api/v1/config -H 'content-type: application/json' -d '{"buffer":{"maxEntries":50000}}'
```

- The whole patch is checked first. An invalid value changes nothing and answers `400` with
  `details.field`.
- The patch is saved to the config file and takes effect on the **next start** of the bridge: the
  running bridge keeps its settings, so `GET` shows the ones in use. The answer of `PUT` shows
  what the next start will use. The file keeps its own settings plus the patch, never values from
  flags or environment variables. If the file can't be written, nothing changes.
- Updates run one at a time, and every setting that differs from the one in use is logged under
  `[config]` as `tcp.port: 4449 → 4450 on the next start`.
- `GET /api/v1/config?view=saved` reads what the next start will use (the answer of `PUT`, also after a reload), and `GET /api/v1/config/overrides` lists the settings a flag or variable sets, which the file can't change. A setting that differs between `GET` and `GET ?view=saved` is waiting for a restart.
- A flag or variable still wins on the next start. The log warns: `[config] WARN tcp.port: saved
  to …\config.json, but --tcp-port overrides it on the next start`.

## CLI flags

| Flag | Default | Description |
|---|---|---|
| `--tcp-host <addr>` | `127.0.0.1` | Interface for the speech TCP listener. The voice runs locally, so keep it on loopback. |
| `--tcp-port <n>` | `4449` | Port the socket voice connects to (the default voice of `text-to-socket-engine` uses 4449). |
| `--tcp-encoding <enc>` | `windows-1252` | Character encoding of the incoming text: the VM's ANSI code page (see [Wire format](speech-capture.md#wire-format)). |
| `--host <addr>` | `0.0.0.0` | Interface for HTTP, which is reached remotely. The Playwright server and MCP are reached through it ([Remote Playwright & MCP](playwright-mcp.md)). |
| `--http-port <n>` | `5151` | HTTP API, the paths `/playwright` and `/playwright-mcp` (see [Remote Playwright & MCP](playwright-mcp.md)), and the [web UI](web-ui.md). |
| `--allowed-hosts <names>` | | More host names the HTTP port answers to, comma-separated (`bridge.lab.example,vm42`), `*` for any ([Host and origin](security.md#host-and-origin)). |
| `--playwright-port <n>` | `3000` | Internal port of the Playwright server, on `127.0.0.1`. Clients use `/playwright` on the HTTP port. |
| `--playwright-version <v>` | *(bundled)* | Playwright version of the server, exact (`1.65.1`). Must match the clients (see [Version](playwright-mcp.md#version)). |
| `--mcp-port <n>` | `8931` | Internal port of Playwright MCP, on `127.0.0.1`. Clients use `/playwright-mcp` on the HTTP port. |
| `--no-playwright` | | Don't start the Playwright server. |
| `--no-mcp` | | Don't start Playwright MCP. |
| `--log-level <level>` | `info` | Level of the bridge's own log: `error`, `warn`, `info`, `debug`. |
| `--bridge-log <path>` | `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log` | File for the bridge's own log (see [Operations](operations.md#logging)). |
| `--console-speech` | off | Also write the received speech to the console. Causes a feedback loop when the console is on the VM ([Operations](operations.md#speech-text-stays-off-the-console)). |
| `--config <path>` | `%APPDATA%\screenreader-speech-capture\config.json` | Use a different config file. |
| `-h`, `--help` / `-v`, `--version` | | Show the options / the version. |
