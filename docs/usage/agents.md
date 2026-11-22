# Agents

How AI agents use the bridge: the CLI, the agent skill and Playwright MCP.

> **Partly planned.** The CLI loop, native input and Playwright MCP work today. The agent skill file exists (not yet tried on a real VM); `install-skill` and the subagents come with [M6](../ROADMAP.md#m6-agents-).

Flows: [Agents](flows/agents.md).

## Agent loop

Agents drive the browser through [Playwright MCP](playwright-mcp.md#playwright-mcp) and read speech through the
[CLI](client.md#cli-for-agents). A typical loop:

```bash
npx screenreader-speech-capture-client config set url http://my-test-vm:5151   # once per user
npx screenreader-speech-capture-client session start "audit checkout page"      # once per task
SEQ=$(npx screenreader-speech-capture-client mark step-1)
# … act through Playwright MCP, or send a screen reader command:
npx screenreader-speech-capture-client press h
npx screenreader-speech-capture-client wait-silence
npx screenreader-speech-capture-client text --since "$SEQ" --json   # → judge the output
```

## Agent skill

The skill file exists in the repo. Shipping it in the npm package and `install-skill` are
*(planned, [M6](../ROADMAP.md#m6-agents-))*. Until then, copy the folder
`packages/client/skills/screenreader-speech-capture/` to `.claude/skills/` (or `~/.claude/skills/`) by hand.

The client package will ship an agent skill in the [Claude Code skill format](https://docs.claude.com/en/docs/claude-code/skills):

```
packages/client/skills/screenreader-speech-capture/SKILL.md
```

It teaches an agent how to use the CLI:

- to start a [session](speech-capture.md#sessions) per task (`session start`) instead of `clear`,
  so a person can follow the task in the [web UI](web-ui.md#context-pane),
- the loop **mark → act → wait-silence → text --since**,
- when to use Playwright MCP input and when to use `press` (screen reader commands),
- that the browser must be in the foreground first, and when to do that again. The CLI has no `focus`
  command: the agent reads the window position with MCP `browser_evaluate` and uses `click --x --y`
  on the title bar (this recipe is not verified on a real VM yet),
- a **preflight**: the CLI is installed, the bridge URL is configured (`config get url`), the bridge is
  ready, the Playwright MCP tools are available and native input works,
- an **interview** before testing: the agent asks which workflow to test, what should be announced at
  each step and what counts as a failure, and can read markdown files describing the page; it agrees
  a numbered plan with the person first,
- the exit codes, and that the exact wording depends on the screen reader and its verbosity.

Install it into a project (or into `~/.claude/skills/` for all projects):

```bash
npx screenreader-speech-capture-client install-skill [--dir .claude/skills]   # planned (M6)
```

Ready-made **subagent definitions** (for example an `a11y-screenreader-tester` that audits a page
with the screen reader and reports what was announced) are on the [roadmap](../ROADMAP.md).
