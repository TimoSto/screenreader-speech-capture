# CLI cheatsheet

Run as `npx screenreader-speech-capture-client <cmd>` or the globally installed binary. Every command
takes `--url <url>` and `--json`. The CLI keeps no state between calls: carry the `mark` seq yourself.

| Command | Notes |
|---|---|
| `--version`, `--help` | installed check |
| `status [--wait-ready] [--timeout ms]` | bridge/tcp/buffer/playwright/mcp/session state; `--wait-ready` default 120000 ms |
| `config get url` / `set url <url>` / `unset url` / `list` / `path` | work without a reachable bridge. Precedence: `--url` > `SR_SPEECH_URL` > client.json > `http://localhost:5151` |
| `session start <name> [--run label]` / `end` / `list` / `delete <id>` | one current session; starting ends the previous one |
| `clear [--session current \| --outside]` | bare `clear` wipes everything: avoid, use sessions |
| `mark <label>` | prints the marker seq |
| `speech [--since seq] [--limit n] [--include-markers] [--session id \| --all]` | entries |
| `text [--since seq] [--separator s] [--session id \| --all]` | joined text, newline default |
| `wait <text> [--regex] [--normalize] [--since seq] [--timeout ms]` | substring; also matches earlier speech with seq > since; markers never match; default 5000 ms |
| `wait-silence [--quiet-for ms] [--timeout ms]` | defaults 500 / 10000 |
| `tail [--since seq]` | live feed until Ctrl+C (NDJSON with `--json`) |
| `press <keys...> [--delay ms]` | native keys: one arg = chord (`"Insert+T"`), several = sequence (`h h Insert+Down`). Max 100 chords |
| `click --x px --y px [--button left\|right\|middle]` | physical pixels; negative as `--x=-5` |

Reads and waits default to the current session (whole buffer if none). `--session`/`--all` are exclusive.

Key names (robotjs, case-insensitive): a-z, 0-9, enter, tab, escape, up/down/left/right, home, end,
pageup, pagedown, f1-f12, space, backspace, delete, insert, capslock. Aliases: Ctrl, Esc, Return, Del, Ins,
PgUp, PgDn, Windows, Meta. Modifiers: Control, Shift, Alt, Win (+ Insert/CapsLock). Unknown key = 400 before
anything is sent.

JSON shapes: speech entry `{seq, kind, text, receivedAt, source, voice, connectionId, sessionId}`;
`speech` -> `{entries, truncated}`; `text` -> `{text, truncated}`; `wait` -> `{matched:true, entry}` or
(exit 1) `{matched:false, entries, truncated}`; `wait-silence` -> `{silent:true}`; `click`/`press` ->
`{clicked|pressed:true}`; `status` -> `{bridge:{state,...}, tcp:{connections}, playwright, mcp, session}`.
Without `--json`, `mark` prints only the seq, which is what `SEQ=$(...)` wants.

Full reference: `docs/usage/client.md`, `docs/usage/native-input.md`, `docs/usage/agents.md`.
