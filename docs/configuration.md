# Configuration

All settings of the bridge: CLI flags, environment variables and the config file.

Precedence: **CLI flags > environment variables > config file > defaults**.

- Config file: `%APPDATA%\screenreader-speech-capture\config.json`
- Environment variables: `SR_SPEECH_` + the flag name in upper snake case, for example
  `SR_SPEECH_TCP_PORT=4449`, `SR_SPEECH_HTTP_PORT=5151`, `SR_SPEECH_NO_MCP=1`.
- The **Settings** page in the UI edits the config file through `PUT /api/v1/config`.

```jsonc
{
  "tcp":        { "host": "127.0.0.1", "port": 4449, "format": "text-to-socket", "encoding": "auto", "maxLineBytes": 65536 },
  "http":       { "host": "0.0.0.0",   "port": 5151 },
  "playwright": { "enabled": true, "port": 3000, "version": null },  // null = bundled version
  "mcp":        { "enabled": true, "port": 8931, "version": null },
  "input":      { "enabled": true },
  "buffer":     { "maxUtterances": 10000 },
  "utteranceLog": { "file": null },                               // JSONL file, null = off
  "log":        { "level": "info", "file": null }                 // bridge log, null = default path
}
```

`tcp.format` selects the parser for the incoming wire format. `text-to-socket` (the default) reads
CRLF-terminated lines, with an optional header line, as described in [Wire format](speech-capture.md#wire-format).
`tcp.encoding` is the code page used to decode them (`auto` = the VM's ANSI code page).
`utteranceLog` and `log` are explained in [Operations](operations.md#logging).

## CLI flags

| Flag | Default | Description |
|---|---|---|
| `--tcp-host <addr>` | `127.0.0.1` | Interface for the speech TCP listener. The voice runs locally, so keep it on loopback. |
| `--tcp-port <n>` | `4449` | Port the socket voice connects to (the default voice of `text-to-socket-engine` uses 4449). |
| `--tcp-encoding <enc>` | `auto` | Character encoding of the incoming text. `auto` uses the VM's ANSI code page (see [Wire format](speech-capture.md#wire-format)). |
| `--host <addr>` | `0.0.0.0` | Interface for HTTP, Playwright server and MCP (these are reached remotely). |
| `--http-port <n>` | `5151` | HTTP API + web UI. |
| `--playwright-port <n>` | `3000` | Playwright server (WebSocket). |
| `--playwright-version <v>` | *(bundled)* | Playwright version of the server. Must match the clients (see [Playwright server](playwright-mcp.md#playwright-server)). |
| `--mcp-port <n>` | `8931` | Playwright MCP (HTTP). |
| `--no-playwright` | | Don't start the Playwright server. |
| `--no-mcp` | | Don't start Playwright MCP. |
| `--no-input` | | Disable the native input endpoints. |
| `--utterance-log <path>` | *(off)* | Also append every utterance to a JSONL file. |
| `--log-level <level>` | `info` | Level of the bridge's own log: `error`, `warn`, `info`, `debug`. |
| `--bridge-log <path>` | `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log` | File for the bridge's own log (see [Operations](operations.md#logging)). |
| `--config <path>` | `%APPDATA%\screenreader-speech-capture\config.json` | Use a different config file. |
