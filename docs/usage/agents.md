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
| `input.native.available`, `input.focus.available` | `true` | No screen reader commands or no `focus`; `reason` says why ([Native input](native-input.md#capturing-the-speech-an-input-causes)). |
| `mcp.state` | `running` | Playwright MCP is disabled, still installing or crashed ([Operations](operations.md#child-service-crashes)). |

Then prove the whole chain once, after MCP opened the page: `focus`, then
`press Insert+T --capture --json` (read the window title, in NVDA and JAWS). It must answer
`"status": "silent"` with the browser's title in `entries`.

## Agent loop

Agents drive the browser through [Playwright MCP](playwright-mcp.md#playwright-mcp) and read speech through the
[CLI](client.md#cli-for-agents), installed once per machine ([Running the CLI](client.md#running-the-cli)).
A typical loop:

```bash
npm i -g screenreader-speech-capture-client@<version>                       # once per machine
screenreader-speech-capture-client config set url http://my-test-vm:5151   # once per user
screenreader-speech-capture-client config set output json                   # once per user: always JSON
screenreader-speech-capture-client session start "audit checkout page"      # once per task

# Before the first screen reader command, and again after anything that could steal focus
# (a new window, a dialog): bring the MCP browser to the foreground (after MCP opened a page).
screenreader-speech-capture-client focus

# A screen reader command: one call presses the key and prints what it caused.
screenreader-speech-capture-client press h --capture --json      # → judge the entries

# An action through Playwright MCP runs in another process, so mark where the step starts:
screenreader-speech-capture-client mark step-2
# … act through Playwright MCP …
screenreader-speech-capture-client wait-silence
screenreader-speech-capture-client text --since mark:step-2 --json   # → judge the output
```

The second pattern, when one announcement is expected (a status message, an error, a live
region): wait for it, from the step's marker on.

```bash
screenreader-speech-capture-client mark save
# … click "Save" through Playwright MCP …
screenreader-speech-capture-client wait "Saved" --since mark:save --json   # exit 1: {"status": "timeout", "entries": […]}
```

Which input to use:

| Goal | Use |
|---|---|
| Interact with the page: navigate, click, type, `Tab`, `Enter` | Playwright MCP (`browser_click`, `browser_type`, `browser_press_key`) |
| Give the screen reader a command: next heading (`h`), read title (`Insert+T`), elements list | `press … --capture`: MCP's keys go through the browser protocol, the screen reader never sees them ([why](native-input.md)) |
| Make the browser the foreground window | `focus`, after MCP opened a page and after anything that could steal focus |

`--help --json` describes every command and the JSON Schema of its output
([Commands](client.md#commands)); with [`output json`](client.md#output-format) a call that
forgets `--json` still prints JSON.

`--since mark:step-2` starts after the newest marker labelled `step-2` in the session, so no
number has to be kept between the calls (each runs in its own shell). Don't use a bare `wait "…"`
to check a step: it searches the whole session and can match what an earlier step said. Pass
`--since`.

## When a step fails

Exit `1` is a result, exit `2` and `3` come with an [error object](client.md#errors-with---json)
([Results and errors](client.md#results-and-errors)). What to do
([flow](flows/agents.md#recovering-from-a-silent-step)):

| What the CLI says | Likely cause | Next step |
|---|---|---|
| `--capture`: `"status": "no-speech"` | The keys went to another window (a dialog, a new window). | `focus`, then repeat the step. Only if it stays silent: raise `--first-within` (a page load, a dialog), or the page really says nothing. |
| `--capture`: `"status": "timeout"`, exit `1` | Speech didn't pause: a live region, a ticking timer, speech still trailing from the previous step. | Judge what was said (it is in `entries`); next time add `--settle 500` or raise `--quiet-for` / `--timeout`. |
| `wait`: `"status": "timeout"`, exit `1` | The text was said differently, or not at all. | Read the `entries` seen; stderr hints at `--normalize` when only case or spaces differ. |
| `focus`: `NOT_FOUND`, exit `2` | Playwright MCP hasn't opened its browser yet. | Navigate with MCP first. |
| `FOCUS_FAILED` or `INPUT_DISABLED`, exit `2` | A locked desktop, or no native input on this bridge. | Stop and report: an agent can't fix it ([Preflight](#preflight)). |
| `--since mark:…`: exit `3` | No such marker in the current session (never set, set before `session start`, or cleared). | Mark again and repeat the step. |
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
- the loop: `press … --capture` for screen reader commands, **mark → act → wait-silence →
  text --since** for Playwright MCP actions,
- when to use Playwright MCP input and when to use `press` (screen reader commands),
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
