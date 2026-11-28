# Agents

How AI agents use the bridge: the CLI, the agent skill and Playwright MCP.

> **Partly planned.** The CLI loop, native input and Playwright MCP work today. `install-skill` and the subagents come with [M6](../ROADMAP.md#m6-agents-).

Flows: [Agents](flows/agents.md).

## Preflight

Before the first step, make sure the setup can work, so silence later means something about the
page, not about the VM ([flow](flows/agents.md#preflight)):

```bash
screenreader-speech-capture-client status --wait-ready --json   # exit 1: not ready in time
```

Stop and report instead of auditing when the answer shows one of these:

| Field | Must be | Otherwise |
|---|---|---|
| `tcp.connections` | not empty | The screen reader doesn't speak through the socket voice ([Troubleshooting](troubleshooting.md#speech)). |
| `input.native.available` | `true` | No `press`: no keyboard operation or screen reader commands; `reason` says why ([Native input](native-input.md#capturing-the-speech-an-input-causes)). |
| `mcp.state` | `running` | Playwright MCP is disabled, still installing or crashed ([Operations](operations.md#child-service-crashes)). |

`input.focus.available: false` alone is no reason to stop: use the click fallback
(`focus --script` / `--geometry`, [Commands](client.md#commands)).

The agent's MCP tools must come from the bridge's Playwright MCP: the server's URL is the bridge
URL plus [`/playwright-mcp`](playwright-mcp.md#playwright-mcp). Any other Playwright MCP offers the
same tool names but drives a browser the screen reader may never read.

Then prove the whole chain once, after MCP opened a page (`about:blank` will do): `focus`, then
`press Insert+T --capture --json` (read the window title, in NVDA and JAWS). It must answer
`"status": "silent"` with the browser's title in `entries`.

## Agent loop

Agents operate the page with native keys (the CLI's `press`), set it up, type text and inspect it
through [Playwright MCP](playwright-mcp.md#playwright-mcp), and read speech through the
[CLI](client.md#cli-for-agents), installed once per machine ([Running the CLI](client.md#running-the-cli)).
A typical loop:

```bash
npm i -g screenreader-speech-capture-client@<version>                       # once per machine
screenreader-speech-capture-client config set url http://my-test-vm:5151   # once per user
screenreader-speech-capture-client config set output json                   # once per user: always JSON
screenreader-speech-capture-client session start "audit checkout page"      # once per task

# Before the first native key, and again after anything that could steal focus
# (a new window, a dialog): bring the MCP browser to the foreground (after MCP opened a page).
screenreader-speech-capture-client focus

# A keyboard operation or a screen reader command: one call presses the key and prints what it caused.
screenreader-speech-capture-client press Tab --capture --json    # → judge the entries
screenreader-speech-capture-client press h --capture --json
```

The second pattern, for a key that activates something or whose announcement may come late (a
status message, an error, a page load): mark first, so the speech can be read again without
pressing again.

```bash
screenreader-speech-capture-client mark save
screenreader-speech-capture-client press Enter --capture --json
screenreader-speech-capture-client wait "Saved" --since mark:save --timeout 15000 --json   # exit 1: {"status": "timeout", "entries": […]}
screenreader-speech-capture-client wait-silence
screenreader-speech-capture-client speech --since mark:save --json   # → judge the whole step
```

The third, for typing text: an action through Playwright MCP runs in another process, so mark where
the step starts. Reach the field with `press Tab` first.

```bash
screenreader-speech-capture-client mark step-3
# … type into the focused field through Playwright MCP …
screenreader-speech-capture-client wait-silence
screenreader-speech-capture-client speech --since mark:step-3 --json   # → judge the output
```

Which input to use:

| Goal | Use |
|---|---|
| Operate the page as a keyboard user: `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrows | `press … --capture` |
| Give the screen reader a command: next heading (`h`), read title (`Insert+T`), elements list | `press … --capture`: MCP's keys go through the browser protocol, the screen reader never sees them ([why](native-input.md)) |
| Navigate to a URL, type text, set up a state, inspect the DOM | Playwright MCP (`browser_navigate`, `browser_type`, `browser_snapshot`) |
| Make the browser the foreground window | `focus`, after MCP opened a page and after anything that could steal focus |

Don't operate a control under test with `browser_click`: it works on elements a keyboard can't
reach or activate, so a failure would pass. Native keys act on whatever has focus: check what has
it before `Enter` or `Space`.

Missing speech right after an action doesn't prove silence. A capture ends at the first pause, and
[`wait-silence`](client.md#commands) counts the quiet from its call, even if nothing was spoken
yet. Wait for the expected text, or for a longer pause (`--quiet-for`), then read again.

`--help --json` describes every command and the JSON Schema of its output
([Commands](client.md#commands)); with [`output json`](client.md#output-format) a call that
forgets `--json` still prints JSON.

`--since mark:step-3` starts after the newest marker labelled `step-3` in the session, so no
number has to be kept between the calls (each runs in its own shell). Don't use a bare `wait "…"`
to check a step: it searches the whole session and can match what an earlier step said. Pass
`--since`.

## When a step fails

Exit `1` is a result, exit `2` and `3` come with an [error object](client.md#errors-with---json)
([Results and errors](client.md#results-and-errors)). What to do
([flow](flows/agents.md#recovering-from-a-silent-step)):

| What the CLI says | Likely cause | Next step |
|---|---|---|
| `--capture`: `"status": "no-speech"` | The keys went to another window (a dialog, a new window), the speech is late, or the page says nothing. | `focus`, check where focus is, read `speech --since` the step's marker if it has one. Repeat the key only if that is harmless (a repeated `Tab` moves on, a repeated `Enter` may submit twice); for slow steps raise `--first-within`. |
| `--capture`: `"status": "timeout"`, exit `1` | Speech didn't pause: a live region, a ticking timer, speech still trailing from the previous step. | Judge what was said (it is in `entries`); next time add `--settle 500` or raise `--quiet-for` / `--timeout`. |
| `speech` after a step: nothing, or less than expected | The announcement hadn't arrived yet. | `wait` for the expected text, or `wait-silence` with a longer `--quiet-for`, then read again. |
| `wait`: `"status": "timeout"`, exit `1` | The text was said differently, or not at all. | Read the `entries` seen; stderr hints at `--normalize` when only case or spaces differ. |
| `focus`: `NOT_FOUND`, exit `2` | Playwright MCP hasn't opened its browser yet, or the MCP tools aren't the bridge's. | Navigate with MCP first. Still `NOT_FOUND`: check the MCP server's URL ([Preflight](#preflight)). |
| `focus`: `INPUT_DISABLED`, exit `2`, but `input.native.available` is `true` | This bridge can't bring windows to the front. | Use the click fallback ([Preflight](#preflight)). |
| `FOCUS_FAILED`, or `INPUT_DISABLED` from `press`, exit `2` | A locked desktop, or no native input on this bridge. | Stop and report: an agent can't fix it ([Preflight](#preflight)). |
| `--since mark:…`: exit `3` | No such marker in the current session (never set, set before `session start`, or cleared). | Mark again; repeat the step if that is harmless. |
| `session start` warns that it ended another client's session | Someone else uses the screen reader. | Stop: two clients can't share it ([Clients](http-api.md#clients)). |
| `BridgeUnreachableError`, exit `2` | The bridge isn't running, or a wrong URL. | `status --wait-ready`, then `config get url`. |

## Agent skill

The client package folder holds an agent skill in the [Claude Code skill format](https://docs.claude.com/en/docs/claude-code/skills):

```
packages/client/skills/audit/SKILL.md
```

It teaches an agent how to use the CLI:

- to start a [session](speech-capture.md#sessions) per task (`session start`) instead of `clear`,
  so a person can follow the task in the [web UI](web-ui.md#context-pane),
- to rehearse the flow through Playwright MCP, without judging speech, before it agrees a test plan,
- to check that its Playwright MCP tools are the bridge's,
- the loop: `press … --capture` for keyboard operations and screen reader commands, **mark →
  act → wait → speech --since** when speech may come late, and for typing through Playwright MCP,
- that Playwright MCP is for setup, typing and the DOM, not for operating the controls under test,
- that the browser must be in the foreground first (`focus`, after MCP opened a page), when to
  do that again, and the `--script` / `--geometry` fallback,
- the exit codes, and that the exact wording depends on the screen reader and its verbosity.

In Claude Code, install it as a plugin: the repo is a plugin marketplace
(`.claude-plugin/marketplace.json`) whose one plugin is the skill folder.

```bash
claude plugin marketplace add TimoSto/screenreader-speech-capture
claude plugin install screenreader-speech-capture@a11y-testing
```

The skill is then `/screenreader-speech-capture:audit`. The plugin has no
version of its own, so updates follow the commits that change that folder. It installs
neither the CLI nor the [MCP registration](#preflight).

*(planned, [M6](../ROADMAP.md#m6-agents-))* Install it into a project (or into `~/.claude/skills/`
for all projects) without the plugin:

```bash
npx screenreader-speech-capture-client install-skill [--dir .claude/skills]
```

Ready-made **subagent definitions** (for example an `a11y-screenreader-tester` that audits a page
with the screen reader and reports what was announced) are on the [roadmap](../ROADMAP.md).
