# CLI overview

Which command does what. Options, defaults and output shapes come from the CLI itself, which
matches the installed version: `--help --json` describes every command and the JSON Schema of its
`--json` output, `<command> --help --json` only that command, and `--help` lists the key names.

Run as `screenreader-speech-capture-client <cmd>` (global install, pinned) or
`npx -y screenreader-speech-capture-client@<version> <cmd>`.

| Command | Does |
|---|---|
| `status` | bridge health, screen reader connection, native input, MCP, current session |
| `config` | the stored bridge URL and output format; works without a reachable bridge |
| `session` | start, end, list and delete sessions |
| `mark` | insert a marker as a step's starting point |
| `speech`, `text` | read entries (with `seq`), or the joined text |
| `wait`, `wait-silence` | wait for an announcement, or for a pause |
| `focus` | bring Playwright MCP's browser to the front; `--script` / `--geometry` is the click fallback |
| `press`, `click` | native keys and mouse; `--capture` returns the speech they caused |
| `clear` | delete recorded speech; agents use sessions instead |
| `tail` | live feed for people; agents use waits or `--capture` |

The CLI keeps no state between calls: `--since mark:<label>` finds a step's start again (the newest
marker with that label; none = exit 3). Reads and waits default to the current session, or the
whole buffer when none is current.

Full reference: <https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#cli-for-agents>,
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/native-input.md>,
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/agents.md>.
