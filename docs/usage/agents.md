# Agents

How AI agents use the bridge: the CLI, the agent skill and Playwright MCP.

> **Partly planned.** The CLI loop, native input and Playwright MCP work today. The agent skill, `install-skill` and the subagents come with [M6](../ROADMAP.md#m6-agents-).

Flows: [Agents](flows/agents.md).

## Agent loop

Agents drive the browser through [Playwright MCP](playwright-mcp.md#playwright-mcp) and read speech through the
[CLI](client.md#cli-for-agents), installed once per machine ([Running the CLI](client.md#running-the-cli)).
A typical loop:

```bash
npm i -g screenreader-speech-capture-client@<version>                       # once per machine
screenreader-speech-capture-client config set url http://my-test-vm:5151   # once per user
screenreader-speech-capture-client session start "audit checkout page"      # once per task

# Before the first screen reader command, and again after anything that could steal focus
# (a new window, a dialog): bring the MCP browser to the foreground. Run the printed function
# with Playwright MCP's browser_evaluate and pass what it returns:
screenreader-speech-capture-client focus --script
screenreader-speech-capture-client focus --geometry '{"screenX":0,"screenY":0,…}'

# A screen reader command: one call presses the key and prints what it caused.
screenreader-speech-capture-client press h --capture --json      # → judge the entries

# An action through Playwright MCP runs in another process, so mark where the step starts:
screenreader-speech-capture-client mark step-2
# … act through Playwright MCP …
screenreader-speech-capture-client wait-silence
screenreader-speech-capture-client text --since mark:step-2 --json   # → judge the output
```

`--since mark:step-2` starts after the newest marker labelled `step-2` in the session, so no
number has to be kept between the calls (each runs in its own shell). Don't use a bare `wait "…"`
to check a step: it searches the whole session and can match what an earlier step said. Pass
`--since`.

## Agent skill

*(planned, [M6](../ROADMAP.md#m6-agents-))*

The client package ships an agent skill in the [Claude Code skill format](https://docs.claude.com/en/docs/claude-code/skills):

```
packages/client/skills/screenreader-speech-capture/SKILL.md
```

It teaches an agent how to use the CLI:

- to start a [session](speech-capture.md#sessions) per task (`session start`) instead of `clear`,
  so a person can follow the task in the [web UI](web-ui.md#context-pane),
- the loop: `press … --capture` for screen reader commands, **mark → act → wait-silence →
  text --since** for Playwright MCP actions,
- when to use Playwright MCP input and when to use `press` (screen reader commands),
- that the browser must be in the foreground first (`focus --script` → MCP `browser_evaluate` →
  `focus --geometry`), and when to do that again,
- the exit codes, and that the exact wording depends on the screen reader and its verbosity.

Install it into a project (or into `~/.claude/skills/` for all projects):

```bash
npx screenreader-speech-capture-client install-skill [--dir .claude/skills]
```

Ready-made **subagent definitions** (for example an `a11y-screenreader-tester` that audits a page
with the screen reader and reports what was announced) are on the [roadmap](../ROADMAP.md).
