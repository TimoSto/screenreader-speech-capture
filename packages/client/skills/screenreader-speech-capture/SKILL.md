---
name: screenreader-speech-capture
description: |-
  Screen reader testing runbook (NVDA/JAWS). Use this skill as your very first action whenever someone wants to test, audit, walk through or "a11y-test" how a running page behaves for screen reader or keyboard users, in English, German or any other language. Examples: what is announced when tabbing through a form or widget; whether error messages or required fields (Pflichtfelder) are read out (vorgelesen); how headings sound in browse mode; focus order; speech compared with the DOM. Also use it when the screenreader-speech-capture client, bridge, MCP or connection status needs fixing before such an audit.

  Load it before curl, Bash, browser tools or clarifying questions, even if the request includes a URL, IP address or status output: DOM snapshots cannot tell you what is spoken, and the skill defines the preflight checks, user interview, speech capture and report.

  Skip it for automated scanners (axe, Lighthouse), ARIA theory questions, plain form filling, writing test code or docs, and build errors.
---

# Screen reader testing with the speech-capture bridge

You test a page the way a screen reader user experiences it: put the real browser in the OS
foreground, move focus and trigger actions, and after **every** step read what the screen reader
actually said and judge it. The bridge records the speech; you supply the steps and the judgement.

Two input paths exist, and the difference matters:

- **Playwright MCP** (`browser_navigate`, `browser_click`, `browser_type`, `browser_press_key`)
  sends input through the browser protocol. The page reacts and the screen reader announces the
  resulting focus and value changes, but it never sees the keys. Use it to interact with the page:
  navigate, click, type, `Tab`, `Enter`, and to inspect the DOM.
- **`press` (native OS keys via the CLI)** sends real keys. Only these reach the screen reader's
  own keyboard hook, so screen reader commands need it: browse-mode `h` / `k` / `d`, `Insert+T`,
  `Insert+F7`, the virtual cursor.

Both only reach the screen reader if the MCP browser is the **OS foreground window**, which MCP
never changes. `focus` does that.

`client` below means `screenreader-speech-capture-client` (globally installed, pinned:
`npm i -g screenreader-speech-capture-client@<version>`), or `npx -y screenreader-speech-capture-client@<version>`
if it isn't installed. Pin a version: an unpinned `npx` runs whatever is newest, and while the
package is `0.x` a minor release may change the CLI.

Pass `--json` on every call you parse (or, with the user's ok, `client config set output json`
once, which makes JSON the default for their user). Exit codes:

| Code | Meaning | stdout with `--json` |
|---|---|---|
| `0` | Success | the result |
| `1` | An expected non-success: a wait timed out, the bridge wasn't ready, speech didn't pause | the result with a `status` (`timeout`, `not-ready`) and the data seen |
| `2` | Bridge unreachable, HTTP error (`INPUT_DISABLED`, `NOT_FOUND`, `FOCUS_FAILED`, …), incompatible version | `{"error":{"type","message","status"?,"code"?}}` |
| `3` | Bad usage, unknown key name, missing marker, bad client config | error object |
| `4` | A bug in the client | error object |

`client --help --json` (or `client <command> --help --json`) describes every command, option and
the JSON Schema of its output. Look there before guessing a flag. More: `references/cli-cheatsheet.md`.

## Step 0: Preflight (do this first; stop and help the user if something fails)

The point: if the setup is broken, every later silence looks like a page bug. Prove the chain
before auditing.

1. **CLI installed?** `screenreader-speech-capture-client --version`. If missing, tell the user and
   offer the pinned global install; don't install without a yes. The client's version doesn't have to
   match the bridge's, but the API major does (exit 2, `IncompatibleBridgeError`, otherwise).
2. **Bridge URL configured?** `client config get url --json`. `source: "default"` means nobody set
   it, and `http://localhost:5151` is only right if the bridge runs on this machine. Ask for the VM's
   address and run `client config set url http://<vm>:5151` (`--url` and `SR_SPEECH_URL` override
   it). This is the *bridge* URL, not the page under test. A host name that isn't an IP needs
   `http.allowedHosts` on the bridge (403 otherwise).
3. **Bridge ready?** `client status --wait-ready --json` (first start can take minutes while
   Playwright installs; exit 1 = `"status": "not-ready"` with a `reason`). Stop and report when:

   | Field | Must be | Otherwise |
   |---|---|---|
   | `tcp.connections` | not empty | The screen reader doesn't speak through the socket voice. |
   | `input.native.available`, `input.focus.available` | `true` | No `press` / no `focus`; `reason` says why (not Windows, robotjs/koffi missing, elevated, locked desktop). |
   | `mcp.state` | `running` | Playwright MCP is disabled, still installing or crashed. |

4. **Playwright MCP tools available?** Look for `browser_navigate` / `browser_evaluate`. If absent,
   give the user the registration (streamable HTTP at the bridge's `/playwright-mcp` path):
   `claude mcp add --transport http screenreader-vm http://<vm>:5151/playwright-mcp`, then they
   restart the session. Don't edit their MCP config yourself.
5. **The whole chain** (after MCP opened a page, see step 3): `client focus --json`, then
   `client press Insert+T --capture --json` (read the window title; NVDA and JAWS both use it). It
   must answer `"status": "silent"` with the browser's title in `entries`. If not, see
   [When a step fails](#when-a-step-fails) before going on.

## Step 1: Gather context

Ask whether the user has markdown files (specs, user stories, component docs, a11y requirements)
describing what the page does, and read any they give (paths may be passed as arguments). Also get the
**page URL** and whether it needs a login (the MCP browser starts with a fresh profile every session,
so there are no cookies; credentials must come from the user, never invent them).

## Step 2: Interview before touching anything

Interview the user until the workflow is unambiguous. Ask in small batches (2-4 questions), pick the
next questions from the previous answers, and offer your best guess as the default so they can just
confirm. Skip questions the context files already answer, but state your assumption. Cover:

- **Workflow**: the exact start state and end goal ("sign in, add item to cart, reach confirmation").
  Which steps, in which order? Happy path only, or also errors (empty required field, wrong password)?
- **Navigation style**: sequential Tab/keyboard flow, screen reader browse mode (headings/landmarks/
  forms), or both?
- **Expectations**: what should be announced at each important step (names, roles, states, error
  messages, live-region updates, page title on load)? Which wordings are mandatory, which are flexible?
- **Screen reader and verbosity**: NVDA or JAWS, language, verbosity. Wording depends on all of these,
  so assertions should match meaning (`--regex` or `--normalize`), not exact strings.
- **Done criteria and scope**: what counts as a failure? Which areas are out of scope? Any steps that
  have side effects (purchases, emails, deletions) that must not be triggered?

Finish by writing the plan back as a numbered list of steps, each with action + expected
announcement, and get a yes before executing. The plan is the contract; without it you cannot tell
"unexpected" from "expected" later.

## Step 3: Start the run and put the browser in the foreground

1. `client session start "<short task name>" --json`. A session scopes reads and waits to this task
   and lets a person follow it in the bridge's web UI. Prefer it over `clear` (`clear --all` wipes
   every session). If it warns that it **ended another client's session**, someone else is using the
   screen reader: stop and tell the user, two clients can't share it.
2. Open the page: MCP `browser_navigate`. MCP only starts its browser on the first browser tool call.
3. `client focus --json` → `{"focused": true, "window": {"title", "pid"}}`. The screen reader
   announces the window. Run the chain check from step 0.5 if you haven't yet.
4. **Keyboard focus inside the page.** `focus` restores the focus the window had, which can be the
   browser's toolbar (a fresh tab focuses the address bar), and the CLI can't move it into the page.
   If Tab or `h` reads the address bar or toolbar, click into the page with MCP (`browser_click` on a
   non-interactive element such as the main heading) and check `document.activeElement` with
   `browser_evaluate`.

Run `focus` again after anything that could steal the foreground: a new window or tab, a popup, a
native dialog, a file picker.

**Fallback** when `focus` can't find the window (`NOT_FOUND` although MCP has a page open) or only
focus is unavailable (`input.focus.available: false`, `input.native.available: true`):
`client focus --script --json` prints a function; run it with MCP `browser_evaluate` and pass its
JSON result to `client focus --geometry '<json>' --capture --json`, which clicks the middle of the
window's title bar and prints what the screen reader said.

## Step 4: The step loop

For every step in the plan, use one of three patterns. Give every step its own marker label.

**A screen reader command** (`h`, `k`, `d`, `Insert+T`, `Insert+Down`, arrows in browse mode):

```bash
client press h --capture --json
# → {"pressed": true, "status": "silent", "entries": [{"seq": 4712, "text": "Shipping, heading level 2", …}], "truncated": false}
```

One call presses the keys and returns exactly the speech they caused: the bridge notes where the
buffer ends right before the input, so earlier speech can't get in. `status` is `silent` (spoke,
then paused), `no-speech` (nothing within `--first-within`, default 2000 ms) or `timeout` (exit 1:
speech didn't pause before `--timeout`, default 10000 ms; `entries` holds what was said). Several
arguments are a sequence (`press h h Insert+Down`), one argument with `+` a chord.

**An action through Playwright MCP** (click, type, `Tab`, `Enter`, navigate). MCP runs in another
process, so mark where the step starts:

```bash
client mark step-3                         # before the action: speech arrives within ms
# … MCP browser_press_key "Tab" / browser_click / browser_type …
client wait-silence --json                 # {"status": "silent"}; exit 1 = speech didn't pause
client text --since mark:step-3 --json     # {"text": "…", "truncated": false}
```

Use `speech --since mark:step-3 --json` instead of `text` when you want the `seq` of each entry to
cite in the report.

**One expected announcement** (a status message, an error, a live region):

```bash
client mark step-4
# … MCP browser_click "Save" …
client wait "saved" --since mark:step-4 --normalize --json
# → {"status": "matched", "entry": {…}}, or exit 1: {"status": "timeout", "entries": [...], "truncated": false}
```

`--regex` matches a pattern (`"Email.*(required|invalid)"`). Why `--since mark:<label>`: the
marker is placed before the action, and `--since` reads only after it, so speech that arrived
before the CLI call is still found while earlier steps can't match. A bare `wait "…"` searches the
whole session and can match what an earlier step said. Marker missing (exit 3): mark again and
repeat the step.

Which input per step:

| Goal | Use |
|---|---|
| Interact with the page: navigate, click, type, `Tab`, `Shift+Tab`, `Enter`, `Space` | Playwright MCP |
| Screen reader command: next heading, read title, elements list, browse-mode arrows | `client press … --capture` |
| Make the browser the foreground window | `client focus` |
| Check *where* focus actually is | MCP `browser_evaluate` on `document.activeElement`, or `browser_snapshot` |

Cross-check: after a Tab, compare the announcement with the focused element's accessible name and
role from an MCP snapshot. A mismatch between DOM and speech is the most valuable kind of finding.

Judge each step immediately against the plan:

- **Name, role, state/value** are all announced (e.g. "Email, edit, required"), not just one of them.
- **Order** follows the visual/logical order, with no skipped or trapped elements.
- **Changes** (errors, status, dialog open/close, live regions) are announced without needing focus.
- **Noise**: duplicate, missing or misleading speech, unlabeled controls ("button", "link" only), raw
  file names or ids. Window and tab titles (also `sr-focus-…` titles from the Playwright fixture) and
  speech from the bridge console are not page bugs; mention them as noise, not findings.
- **Silence** after an action that should announce something is a finding only once the environment
  is ruled out (see below).

Interrupted speech is still recorded, so the log can show more than a listener would hear. Treat
very short, quickly replaced announcements with care. `"truncated": true` means the bridge's buffer
dropped entries: the transcript has a gap, so re-run the step instead of trusting it (or ask the user
to raise `buffer.maxEntries`).

## When a step fails

Exit 1 is a result to judge, exit 2 and 3 come with an error object. Condensed from
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/agents.md#when-a-step-fails>:

| What the CLI says | Likely cause | Next step |
|---|---|---|
| `--capture`: `"status": "no-speech"` | The keys went to another window (a dialog, a new window). | `focus`, repeat the step. Only if it stays silent: raise `--first-within` (page load, dialog), or the page really says nothing. |
| `--capture`: `"status": "timeout"`, exit 1 | Speech didn't pause: a live region, a timer, speech trailing from the previous step. | Judge `entries`; next time add `--settle 500` or raise `--quiet-for` / `--timeout`. |
| `wait`: `"status": "timeout"`, exit 1 | Said differently, or not at all. | Read `entries`; stderr hints at `--normalize` when only case or spaces differ. |
| `focus`: `NOT_FOUND`, exit 2 | MCP hasn't opened its browser yet. | Navigate with MCP first. |
| `FOCUS_FAILED` or `INPUT_DISABLED`, exit 2 | Locked desktop, or no native input on this bridge. | Stop and report: an agent can't fix it. |
| `--since mark:…`: exit 3 | No such marker in the current session. | Mark again, repeat the step. |
| `BridgeUnreachableError`, exit 2 | Bridge not running, or wrong URL. | `status --wait-ready`, then `config get url`. |

## Step 5: Report

End with `client session end`, then give the user a report (see `references/report-template.md`):
the plan with a pass/fail/unclear verdict per step, the exact speech captured for each (quote it),
what you expected, and the likely cause when you can tell (DOM evidence from MCP). Separate **page
findings** from **environment doubts** (focus, verbosity, screen reader differences) so the user can
tell which to fix. Say plainly what you could not verify. Cite the entries' `seq` numbers and the
session id so a person can find each step in the bridge's web UI.

## Ground rules

- Never fabricate speech or assume what the screen reader "would" say; only report what was captured.
- Only one thing drives the screen reader at a time: one session, one browser in front. A browser
  started by Playwright tests and the MCP browser are separate windows.
- Don't change the bridge config, install packages, or touch the user's MCP/CLI settings without
  asking. `config set url` is fine once the user gave you the address.
- Native input is not yet verified on a real VM (ROADMAP M7): `Insert` / `CapsLock` as held
  modifiers and `focus` with a screen reader running. If `Insert+…` commands do nothing while plain
  keys work, say so rather than concluding the page is broken.
