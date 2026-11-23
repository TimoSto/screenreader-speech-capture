# Bridge ↔ client review: the CLI as an agent's tool

A review of how `packages/client` talks to `packages/bridge`, with a focus on an AI agent that
drives the screen reader through the CLI. Like [Simplification candidates](simplification-candidates.md),
it is **not a decision record**: nothing here is agreed yet. Decided items move to
[Decisions](decisions.md) and are removed from here.

Reviewed at commit `6b03a07` (client M2 + M4 CLI, bridge M1–M4).

## Summary

The contract is solid: a shared valibot schema checks every answer, the `--json` output has a
schema for each command, exit codes are clear, and `seq` stays meaningful across restarts. The
weak spots are the parts that matter most to an agent:

1. **The CLI has no memory, so a step takes several calls and shell variables.** An agent has to
   mark, act, wait for silence and read. Each of those calls is a separate process with its own
   requests, and the agent has to carry the `seq` between them.
2. **`--capture` measures silence on the wrong machine.** Silence is timed in the client, across
   the network, and the capture's start is read in a separate request before the key press.
3. **Focusing the browser takes three tool calls** (`focus --script` → MCP `browser_evaluate` →
   `focus --geometry`), although the bridge supervises the MCP process tree that owns the browser.

The proposals below are ordered by value to an agent compared with cost.

## Findings and proposals

### Done: capture timeouts and late first speech (former items 1 and 2)

- A `--capture` whose speech doesn't pause is a result, not an error: `"silent": false`, the speech
  recorded until the timeout, exit `1`. The library's `record()` still throws `SpeechTimeoutError`,
  now with the whole recording as its `entries`. `wait-silence` lists the speech seen on stderr.
- `record()` and `--capture` wait up to `firstWithin` / `--first-within` ms (default 2000) for the
  first speech, then `quietFor` from there. An empty capture prints nothing on stdout and
  `no speech after the action` on stderr (`"entries": []` with `--json`; no separate `spoke` field).
- Still open from item 2: `--expect <text>` on `press` / `click` (capture, then exit `1` if no
  entry matches, with the `wait` matcher), which would make "press, then check the announcement"
  one call.

### 3. Run capture on the bridge (medium, high value)

**Now:** `press h --capture` from the CLI makes five requests plus one SSE stream (more when the read pages),
because `ctx.speech()` and `ctx.input()` are two `SpeechCaptureClient` instances with their own
version gate:

| # | Request | Why |
|---|---|---|
| 1 | `GET /status` | version gate of the speech client |
| 2 | `GET /status` | `endSeq()`: where the capture starts |
| 3 | `GET /status` | version gate of the input client |
| 4 | `POST /input/keys` | the press |
| 5 | `GET /speech/stream` | follow from the start `seq` until quiet |
| 6 | `GET /speech?since=…` | read what was said (more if paged) |

The agent typically runs on another machine than the VM. Every round trip adds latency between
"start seq read" and "key injected", and the silence is timed on the client, where SSE delivery
jitter counts as speech gaps. Speech still trailing from the previous step that arrives between
request 2 and 4 is attributed to this press.

**Proposal:** a bridge endpoint that does the whole step where the speech and the input are:

```
POST /api/v1/input/keys   { "keys": "h", "capture": { "quietForMs": 500, "firstWithinMs": 2000,
                                                       "timeoutMs": 10000, "settleMs": 0 } }
→ 200 { "status": "silent" | "timeout" | "no-speech", "startSeq": 4711, "entries": […],
        "truncated": false }
```

- The bridge reads the start `seq` inside the input queue, right before injecting (atomic with the
  press, no foreign speech in between).
- Silence is timed on the bridge's `Clock` from the `receivedAt` of the entries, not from network
  arrival.
- `settleMs` optionally waits for silence *before* pressing, so trailing speech of the previous
  step can't leak in.
- The same for `/input/click`.
- One request instead of six. The client's `record()` stays for functions that run in the client
  (Playwright actions in tests); the CLI's `--capture` uses the endpoint.

This is consistent with [Client waits read the live feed](decisions.md#client-waits-read-the-live-feed):
that decision is about matching (predicates must run in the client). A capture has no predicate,
and its correctness depends on the order of "seq read" and "key injected", which only the bridge
can guarantee.

Smaller fix that helps today regardless: let the CLI build **one** `SpeechCaptureClient` for both
`speech` and `input` (`bin/cli.ts` creates two).

### 4. Give the CLI a cursor, so a step is two calls (medium, high value)

**Now:** the library has a cursor; the CLI has none ("a CLI call has no memory between
invocations"). The documented agent loop for a Playwright MCP action is:

```bash
SEQ=$(… mark step-2)          # agent must keep $SEQ in its context
# … MCP action …
… wait-silence
… text --since "$SEQ" --json
```

Agents run tool calls in separate shells, so `$SEQ` usually doesn't survive; the agent has to copy
the number from one output into the next command. A bare `wait "…"` searches the whole session,
the trap the docs warn about twice.

**Proposal (pick one):**

- **Named markers as `--since`:** `--since mark:step-2` (or `--after step-2`) resolves to the
  newest marker with that label in the scope. No number to carry, no shell state. Cheap: the
  client finds it in `GET /speech?…` with markers, or the bridge accepts `since=mark:<label>`.
- **`--since last-mark`:** the newest marker in the current session. Covers the
  mark → act → read loop with zero bookkeeping.
- **One "step" command:** `step begin <label>` (= `mark`) and `step end [--quiet-for]
  [--expect <text>]` (= wait-silence + `text --since <that marker>`, plus the optional check).
  That makes the MCP case as short as `press --capture`.

A server-side cursor per client name (the `X-SR-Speech-Client` header) would also work, but it
adds state to the bridge that a restart loses and that two agents on one host would share; the
marker-based options keep the state in the buffer, where it is visible in `tail` and the web UI.

### 5. Focus the browser from the bridge (medium/large, high value)

**Now:** `focus --script` prints a function, the agent runs it with MCP `browser_evaluate`, then
passes the JSON to `focus --geometry`, which clicks the title bar. Three tool calls, a JSON blob to
copy between tools, and it is needed again after anything that steals focus. The title-bar click
also guesses the title bar from `outerHeight - innerHeight`, which breaks with a maximized window
on another DPI or a browser without a title bar.

**Proposal:** the bridge supervises Playwright MCP (`adapters/out/mcp`) and its process tree
(`adapters/out/process/process-tree.ts`), so it can find the top-level browser window of that tree
and bring it to the foreground natively (`SetForegroundWindow` / `AllowSetForegroundWindow` via a
small native helper or PowerShell, since robotjs can't): `POST /input/focus { "target": "mcp" }`
and a CLI `focus` without arguments. Keep `--script/--geometry` as the fallback for a browser the
bridge didn't start. Also worth adding: `GET /input/foreground` (title and pid of the foreground
window), so `press` can warn or refuse (`--require-focus mcp`) when the keys would go elsewhere,
which is today a silent and confusing failure (the screen reader reads the wrong window).

### 6. Make the CLI discoverable for agents (small, medium value)

- **Per-command help:** `press --help` prints the global help. Agents call `<cmd> --help` first;
  print the command's own `HelpLine`s and options (already in the command table).
- **Machine-readable help:** `help --json` (or `schema`) printing the commands, their options and
  the `--json` output schema from `output.ts` (valibot → JSON Schema, as `pnpm openapi` already
  does for the API). That is also the natural input for the planned agent skill (M6) and keeps the
  skill from drifting.
- **JSON by default for agents:** an env var (`SR_SPEECH_OUTPUT=json`) or `config set output json`,
  so an agent that forgets `--json` once doesn't get a different shape.
- **Empty text output:** `press --capture` with no speech prints an empty line, `text` with no
  speech too. Print nothing on stdout and a short note on stderr (`(no speech)`), so a human or an
  agent reading text mode can tell.

### 7. Consistent result shapes (small, medium value)

| Command | Timeout / nothing found | Shape |
|---|---|---|
| `wait` | exit 1 | `{ matched: false, entries, truncated }` on stdout |
| `wait-silence` | exit 1 | `{ error: { type: SpeechTimeoutError } }` |
| `press/click --capture` | exit 1 | `{ pressed: true, silent: false, entries, truncated }` |
| `status --wait-ready` | exit 1 | `{ error: { type: BridgeNotReadyError } }` |

An agent has to know per command whether exit `1` comes with a result or with an error object.
Proposal: every "expected outcome" (no match, no silence, not ready) is a result with a `status`
field and the data seen, the same way the bridge's `GET /speech/wait` already answers
(`status: matched | timeout`). Errors stay for things that went wrong (unreachable, refused,
usage). Document one rule: exit `1` = result with `status` ≠ success, exit `2–4` = error object.

### 8. Use the bridge's `GET /speech/wait` for a plain CLI `wait` (small, low–medium value)

The CLI `wait` only ever sends a string or a regex, which the bridge's `/speech/wait` supports
(including `normalize`, `session` and the same `seen` limit). Using it from the CLI would replace
status + `GET /speech` + SSE with one request and resolve `session=current` on the bridge. The
library keeps the feed-based waits for predicates and sequences, as the decision says. Downside:
two code paths for one CLI feature; only worth it if CLI latency matters (it does over a slow
link to the VM). Note that the bridge caps `timeoutMs` at 300 000 while the client's own wait has
no cap; the CLI should state the limit either way.

### 9. Smaller points

- **`scope()` costs an extra `GET /status`** for every `speech`, `text` and `wait` without
  `--session`/`--all`. It doubles as the version check, so it is cheap; but the bridge could
  accept a `session=active` meaning "the current one, or the whole buffer if none" and drop the
  round trip and the client-side rule.
- **`session start` replaces another client's session with only a stderr warning.** For agents
  running in parallel against one VM (unsupported, but easy to do by accident) a
  `--fail-if-active` flag (`409` when another client's session is current) would turn silent
  corruption into an error.
- **`mark` prints only the seq in text mode.** Fine for `$(…)`, but the label isn't echoed; an
  agent reading its own transcript later can't tell which seq belongs to which step. `#4712 step-2`
  would still parse with `cut`, or keep the bare number and rely on `--json`.
- **Version skew is only found at the first request.** `--version` prints the client's version;
  `status` the bridge's. A `doctor` command (URL source, reachability, API versions, voice
  connected, input enabled, MCP state, foreground window) would give an agent one call to check
  the setup before a run, instead of finding problems through failing steps. Most of it is in
  `GET /status` already; input availability (`INPUT_DISABLED`) is not.
- **`tail` is for people,** as its help says. Agents that want a running log of a whole task are
  better served by `speech --since <session start>` at the end than by a background `tail`; the
  agent skill (M6) should say so.

## Suggested order

| Step | Items | Effort |
|---|---|---|
| 1 | ~~Capture timeout keeps speech, wait for the first speech~~ (done), one client instance (3, small fix), `--expect` | Client only, small |
| 2 | `--since mark:<label>` / `last-mark` (4), per-command and JSON help (6), result shapes (7) | Client (+ optional bridge query param), small–medium |
| 3 | Bridge-side capture with `firstWithinMs` / `settleMs` (3) | Bridge + shared + client, medium; API minor version |
| 4 | Native focus of the MCP browser, foreground check (5), `doctor` | Bridge (Windows-specific), medium–large; needs the M7 VM smoke test |

Steps 1 and 2 should land before the agent skill (M6), since the skill would otherwise teach the
workarounds (`$SEQ`, the focus dance) that these items remove.
