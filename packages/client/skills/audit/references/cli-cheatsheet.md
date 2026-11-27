# CLI cheatsheet

Run as `screenreader-speech-capture-client <cmd>` (global install, pinned) or
`npx -y screenreader-speech-capture-client@<version> <cmd>`. Every command takes `--url <url>` and
`--json`. The CLI keeps no state between calls: find a step's start again with `--since mark:<label>`.

The authoritative reference is the CLI itself: `--help --json` lists every command, its options and
the JSON Schema of its `--json` output; `<command> --help --json` only that command.

| Command | Notes |
|---|---|
| `--version`, `--help [--json]` | installed check, usage |
| `status [--wait-ready] [--timeout ms]` | bridge, tcp, buffer, playwright, mcp, session, input; `--wait-ready` default 120000 ms |
| `config get\|set\|unset url [<url>]`, `config get\|set\|unset output [json\|text]`, `config list`, `config path` | work without a reachable bridge. URL: `--url` > `SR_SPEECH_URL` > client.json > `http://localhost:5151`. Output: `--json` > `SR_SPEECH_OUTPUT` > client.json > `text` |
| `session start <name> [--run label]` / `end` / `list` / `delete <id>` | one current session; starting ends the previous one (stderr warns if it was another client's) |
| `clear --all \| --session <id\|current> \| --outside` | a bare `clear` is a usage error; agents use sessions instead |
| `mark <label>` | prints `#<seq> [marker] <label>` (the entry with `--json`) |
| `speech [--since s] [--limit n] [--include-markers] [--session <id\|current> \| --all]` | entries, oldest first |
| `text [--since s] [--separator str] [--session … \| --all]` | joined text, one line per entry |
| `wait <text> [--regex] [--normalize] [--since s] [--timeout ms] [--session … \| --all]` | substring; also finds speech that arrived before the call; markers never match; default 5000 ms |
| `wait-silence [--quiet-for ms] [--timeout ms]` | defaults 500 / 10000 |
| `focus` | bridge brings Playwright MCP's browser window to the front |
| `focus --script` / `focus --geometry '<json>' [--capture …]` | click fallback: run the script with MCP `browser_evaluate`, pass its result; clicks the title bar |
| `press <keys...> [--delay ms] [--capture …]` | native keys: one arg = chord (`"Insert+T"`), several = sequence (`h h Insert+Down`); max 100 chords |
| `click --x px --y px [--button left\|right\|middle] [--capture …]` | physical pixels; negative as `--x=-5` |
| `tail [--since s]` | live feed until Ctrl+C, for people (NDJSON with `--json`); agents use waits or `--capture` |

`--since` takes a seq (`4712` or `#4712`) or `mark:<label>` (the newest marker with that label in
the scope the command reads; none = exit 3).

`--capture` options: `--first-within` (default 2000 ms), `--quiet-for` (500), `--timeout` (10000),
`--settle` (0: first wait for that much silence, to keep out trailing speech).

Reads and waits default to the current session, or the whole buffer when none is current.

Key names (case-insensitive): a-z, 0-9, enter, tab, escape, space, backspace, delete, up, down,
left, right, home, end, pageup, pagedown, f1-f12. Modifiers: control, shift, alt, win, insert,
capslock. Aliases: ctrl, windows/meta (win), esc, return, del, ins, pgup, pgdn. Unknown key = exit 3
before anything is sent.

JSON shapes (`--json`):

- speech entry: `{seq, kind, text, receivedAt, source, voice, connectionId, sessionId}`
- `speech` → `{entries, truncated}`; `text` → `{text, truncated}`; `mark` → the marker entry
- `wait` → `{status: "matched", entry}` or (exit 1) `{status: "timeout", entries, truncated}`
- `wait-silence` → `{status: "silent"}` or (exit 1) the same `timeout` result
- `press` / `click` → `{pressed|clicked: true}`; with `--capture` also
  `{status: "silent"|"no-speech"|"timeout", entries, truncated}` (`timeout` exits 1)
- `focus` → `{focused: true, window: {title, pid}}`; `--script` → `{script}`; `--geometry` →
  `{focused: true, point: {x, y}}` (+ capture fields)
- `status` → `{bridge: {version, apiVersion, state}, tcp: {connections}, buffer, playwright, mcp,
  session: {current, count}, input: {native, focus}}`, each `input.*` `{available, backend, reason}`;
  with `--wait-ready` plus `status: "ready"`, or (exit 1) `{status: "not-ready", reason}`
- errors (exit 2-4): `{"error": {"type", "message", "status"?, "code"?, "details"?}}`

Full reference: <https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#cli-for-agents>,
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/native-input.md>,
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/agents.md>.
