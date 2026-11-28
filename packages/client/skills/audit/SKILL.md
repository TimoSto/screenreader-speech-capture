---
name: audit
description: |-
  Screen reader testing runbook (NVDA/JAWS). Use this skill as your very first action whenever someone wants to test, audit, walk through or "a11y-test" how a running page behaves for screen reader or keyboard users, in English, German or any other language. Examples: what is announced when tabbing through a form or widget; whether error messages or required fields (Pflichtfelder) are read out (vorgelesen); how headings sound in browse mode; focus order; speech compared with the DOM. Also use it when the screenreader-speech-capture client, bridge, MCP or connection status needs fixing before such an audit.

  Load it before curl, Bash, browser tools or clarifying questions, even if the request includes a URL, IP address or status output: DOM snapshots cannot tell you what is spoken.

  Skip it for automated scanners (axe, Lighthouse), ARIA theory questions, plain form filling, writing test code or docs, and build errors.
---

# Screen reader testing with the speech-capture bridge

You test a page the way a screen reader user experiences it: put the real browser in the OS
foreground, operate it with the keyboard, and after **every** step read what the screen reader
actually said and judge it. The bridge records the speech; you supply the steps and the judgement.

Two input paths exist, and the difference matters:

- **`press` (native OS keys via the CLI)** sends real keys, like a user's keyboard: past the screen
  reader's keyboard hook, then to whatever has focus in the foreground window. In the test run, use
  it for every keyboard operation (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrows) and
  every screen reader command (browse-mode `h` / `k` / `d`, `Insert+T`, `Insert+F7`).
- **Playwright MCP** (`browser_navigate`, `browser_type`, `browser_click`, `browser_snapshot`,
  `browser_evaluate`) works through the browser protocol, so the screen reader never sees its keys.
  Use it for the rehearsal, to set up a start state, to type text and to inspect the DOM.

Either way, you only get useful speech while the MCP browser is the **OS foreground window** (the
active window on the desktop). Playwright MCP can't bring it there. The CLI command `client focus`
(see below) does. It activates the window only and doesn't move keyboard focus to an element in
the page.

`client` below is shorthand, not a command: write out `screenreader-speech-capture-client`
(globally installed, pinned: `npm i -g screenreader-speech-capture-client@<version>`) in every
call, or `npx -y screenreader-speech-capture-client@<version>` if it isn't installed. An alias may
not survive to the next call. Pin a version: an unpinned `npx` runs whatever is newest, and while
the package is `0.x` a minor release may change the CLI.

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
the JSON Schema of its output. Look there before guessing a flag. Overview:
`references/cli-cheatsheet.md`.

## Step 0: Preflight (do this first; stop and help the user if something fails)

The point: if the setup is broken, every later silence looks like a page bug. Prove the whole chain
before you ask about the page.

1. **CLI installed?** `screenreader-speech-capture-client --version`. If missing, tell the user and
   offer the pinned global install; don't install without a yes. The client's version doesn't have to
   match the bridge's, but the API major does (exit 2, `IncompatibleBridgeError`, otherwise).
2. **Bridge URL configured?** `client config get url --json`. `source: "default"` means nobody set
   it, and `http://localhost:5151` is only right if the bridge runs on this machine. Ask for the VM's
   address and run `client config set url http://<vm>:5151` (`--url` and `SR_SPEECH_URL` override
   it). This is the *bridge* URL, not the page under test. A host name that isn't an IP may need
   `http.allowedHosts` on the bridge (403 otherwise).
3. **Bridge ready?** `client status --wait-ready --json` (first start can take minutes while
   Playwright installs; exit 1 = `"status": "not-ready"` with a `reason`). Stop and report when:

   | Field | Must be | Otherwise |
   |---|---|---|
   | `tcp.connections` | not empty | The screen reader doesn't speak through the socket voice. |
   | `input.native.available` | `true` | No `press`; `reason` says why (not Windows, robotjs missing, …). |
   | `mcp.state` | `running` | Playwright MCP is disabled, still installing or crashed. |

   `input.focus.available: false` alone isn't a stop: use the click fallback in
   [Step 4](#step-4-start-the-run-and-put-the-browser-in-the-foreground) instead of `client focus`.

4. **The bridge's Playwright MCP?** Tool names don't tell: any Playwright MCP offers
   `browser_navigate`, and a local one drives a browser the VM's screen reader never reads. Look up
   the server's URL (`claude mcp list`): it must be the `value` from check 2 plus
   `/playwright-mcp`. Use only that server's tools (`mcp__<server>__browser_*`) from here on. If no
   server has that URL, give the user the registration command with it filled in (streamable HTTP):
   `claude mcp add --transport http screenreader-vm <value>/playwright-mcp`. Then they restart the
   session. Don't edit their MCP config yourself. If you can't find out the URL, ask.
5. **The whole chain.** This takes over the shared browser and screen reader, so if
   `client status --json` shows a current session (`session.current`), ask the user first. Then MCP
   `browser_navigate` to `about:blank`, `client focus --json` (or the click fallback of Step 4), and
   `client press Insert+T --capture --json` (read the window title; NVDA and JAWS both use it). It
   must answer `"status": "silent"` with the browser's window title in `entries`. If not, see
   [When a step fails](#when-a-step-fails) before going on.

## Step 1: Gather context

Ask whether the user has markdown files (specs, user stories, component docs, a11y requirements)
describing what the page does, and read any they give (paths may be passed as arguments). Also get the
**page URL** and whether it needs a login (the MCP browser starts with a fresh profile every session,
so there are no cookies; credentials must come from the user, never invent them).

Before you click anything, also settle:

- **The flow in outline**: where it starts and what its end goal is.
- **Environment**: a test system or production?
- **Side effects**: which actions must never be triggered (purchases, emails, deletions)?
- **Test data**: can it be used more than once, or reset?

## Step 2: Rehearse the flow (no speech judging yet)

Walk the described flow once with Playwright MCP before you plan the test. It shows what a
description leaves out (cookie banners, dialogs, validation, extra steps, slow loading) and whether
the flow works at all, so a later failure isn't mistaken for a screen reader problem.

1. MCP `browser_navigate`, `browser_snapshot`, then go through the flow with MCP clicks and typing.
   Stay on the described flow; don't crawl the application.
2. Note for each step: the action, the element (role and accessible name), what changes (dialog,
   error, toast, route, focus) and how long it takes. This tells you what to ask and how long to
   wait in the test.
3. Stop before any side effect the user hasn't allowed. On production, submit nothing without a yes.
   If you can't complete the flow, ask the user instead of guessing.
4. Restore the start state: MCP `browser_close` discards the browser profile (check that the next
   page load is signed out and fresh). Data on the server stays changed, so ask the user to reset it
   if the flow needs that.

The rehearsal is **not a test result**: input through MCP proves nothing about keyboard or screen
reader use. Odd things in the DOM (a button without a name) are suspicions to verify in the test, not
findings. Skip or shorten the rehearsal if the user declines it or a step can't be repeated (a
one-time token, an irreversible action).

## Step 3: Interview and agree the plan

Show the user what the rehearsal found, then interview them until the workflow is unambiguous. Ask in
small batches (2-4 questions), pick the next questions from the previous answers, and offer your best
guess as the default so they can just confirm. Skip questions that are already answered (context
files, step 1, the rehearsal), but state your assumption. Cover:

- **Workflow**: the exact start state and end goal ("sign in, add item to cart, reach confirmation").
  Which steps, in which order? Happy path only, or also errors (empty required field, wrong password)?
- **Navigation style**: sequential Tab/keyboard flow, screen reader browse mode (headings/landmarks/
  forms), or both?
- **Expectations**: what should be announced at each important step (names, roles, states, error
  messages, live-region updates, page title on load)? Which wordings are mandatory, which are flexible?
- **Screen reader and verbosity**: NVDA or JAWS, language, verbosity. Wording depends on all of these,
  so assertions should match meaning (`--regex` or `--normalize`), not exact strings.
- **Done criteria and scope**: what counts as a failure? Which areas are out of scope?

Finish by writing the plan back as a numbered list of steps, each with action + expected
announcement, and get a yes before executing. The plan is the contract; without it you cannot tell
"unexpected" from "expected" later. Take expected announcements from the visible UI, the specs and
the user, **never from the DOM**: otherwise a wrong label becomes the expectation and passes.

## Step 4: Start the run and put the browser in the foreground

1. `client session start "<short task name>" --json`. A session scopes reads and waits to this task
   and lets a person follow it in the bridge's web UI. Prefer it over `clear` (`clear --all` wipes
   every session). If it warns that it **ended another client's session**, someone else is using the
   screen reader: stop and tell the user, two clients can't share it.
2. Open the page in its start state: MCP `browser_navigate`. MCP only starts its browser on the
   first browser tool call.
3. `client focus --json` → `{"focused": true, "window": {"title", "pid"}}`. The screen reader
   announces the window.
4. **Keyboard focus inside the page.** `client focus` leaves keyboard focus wherever it last was
   in that window. That can be the browser's toolbar (a fresh tab starts in the address bar).
   Confirm with speech: `client press Tab --capture --json` must announce an element of the page.
   `document.activeElement` can't show this, because it describes the page even while the keyboard
   is in the toolbar. If you hear the address bar or toolbar, `browser_click` a non-interactive
   element such as the main heading and check with Tab again. Either way the check moved focus, so
   restore the start state (re-open the page with `browser_navigate`) before the first step.

Run `client focus` again after anything that could steal the foreground: a new window or tab, a
popup, a native dialog, a file picker.

**Click fallback**, when focusing is unavailable (`input.focus.available: false`) or `client focus`
still answers `NOT_FOUND` with a page open: `client focus --script --json` prints a function; run it
with MCP `browser_evaluate` and pass its JSON result to
`client focus --geometry '<json>' --capture --json`, which clicks the middle of the window's title
bar and prints what the screen reader said. This is a real click on the VM at coordinates the page
reports, so first make sure the MCP server is the bridge's (preflight check 4): geometry from a
browser on another machine clicks a random spot.

## Step 5: The step loop

Pick the pattern by what the step does, and give each marker a new label. `--capture` and
`client speech` give each entry's `seq`, which the report cites.

**Move or read** (`Tab`, `Shift+Tab`, arrows, `h`, `k`, `d`, `Insert+T`, `Insert+Down`):

```bash
client press Tab --capture --json
# → {"pressed": true, "status": "silent", "entries": [{"seq": 4712, "text": "Email, edit, required", …}], "truncated": false}
```

One call presses the keys and returns the speech they caused: the bridge notes where the buffer
ends right before the input, so earlier speech can't get in. `status` is `silent` (spoke, then
paused), `no-speech` (nothing within `--first-within`, default 2000 ms) or `timeout` (exit 1:
speech didn't pause before `--timeout`, default 10000 ms; `entries` holds what was said). Several
arguments are a sequence (`press h h Insert+Down`), one argument with `+` a chord.

**Activate** (`Enter`, `Space`, `Escape`), or any key whose announcement may come late (a server
error, a toast, a page load). Mark first, so you can read again without pressing again:

```bash
client mark step-4
client press Enter --capture --json            # the immediate speech
client wait "saved" --since mark:step-4 --normalize --timeout 15000 --json   # the expected announcement
client wait-silence --json                     # let the rest finish; exit 1 = speech didn't pause
client speech --since mark:step-4 --json       # everything the step said: judge this
```

Native keys act on whatever has focus. Before `Enter` or `Space`, make sure the last capture or
`document.activeElement` shows the control you mean, above all near an action that must never be
triggered.

**Type text** (Playwright MCP; also for setting up a state). Reach the field with `press Tab`, then
`browser_type` into that same field, with `submit` off: `Enter` is a step of its own.

```bash
client mark step-3                             # before the action: MCP runs in another process
# … MCP browser_type …
client wait-silence --json
client speech --since mark:step-3 --json
```

**Late speech is not silence.** A capture ends at the first pause (500 ms), and `wait-silence`
returns after that much quiet counted from its call, even if nothing was spoken at all. So missing
speech right after an action proves nothing yet. Wait for the expected text
(`wait … --since mark:…`), or without one for a pause longer than the delay you saw in the
rehearsal (`wait-silence --quiet-for 3000`), then read again with `speech --since`: from the
step's marker, or without one from the last `seq` you saw. For a slow step, also raise
`--first-within` / `--quiet-for` on its capture.

`wait` returns only the matching entry, so judge the step from `speech --since`: noise or a missing
role shows there. `--regex` matches a pattern (`"Email.*(required|invalid)"`). A bare `wait "…"`
searches the whole session and can match what an earlier step said; always pass `--since`.

Which input per step:

| Goal | Use |
|---|---|
| Operate the page: `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrows | `client press … --capture` |
| Screen reader command: next heading, read title, elements list | `client press … --capture` |
| Type text, navigate to a URL, set up a state | Playwright MCP |
| Make the browser the foreground window | `client focus` |
| Check *where* focus is in the page | MCP `browser_evaluate` on `document.activeElement`, or `browser_snapshot` |

**The keyboard is part of the test.** Don't operate a control under test with `browser_click` or
`browser_press_key`: a `div` with only a click handler works that way and fails every keyboard
user. If the keyboard can't reach or activate a control, the step fails. You may then click it to
reach the next step; say so in the report.

Cross-check: after a Tab, compare the announcement with the focused element's accessible name and
role from an MCP snapshot. A mismatch between DOM and speech is the most valuable kind of finding.

Judge each step immediately against the plan:

- **Name, role, state/value** are all announced (e.g. "Email, edit, required"), not just one of them.
- **Order** follows the visual/logical order, with no skipped or trapped elements.
- **Changes** (errors, status, dialog open/close, live regions) are announced without needing focus.
- **Noise**: duplicate, missing or misleading speech, unlabeled controls ("button", "link" only), raw
  file names or ids. Window and tab titles (also `sr-focus-…` titles from the Playwright fixture) and
  speech from the bridge console are not page bugs; mention them as noise, not findings.
- **Silence** after an action that should announce something is a finding only once late speech and
  the environment are ruled out.

Interrupted speech is still recorded, so the log can show more than a listener would hear. Treat
very short, quickly replaced announcements with care. `"truncated": true` means the bridge's buffer
dropped entries: the transcript has a gap, so don't trust it. Re-run the step if that is harmless,
and ask the user to raise `buffer.maxEntries`.

## When a step fails

Exit 1 is a result to judge, exit 2 and 3 come with an error object. Condensed from
<https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/agents.md#when-a-step-fails>.
"Repeat" never means pressing `Enter` or `Space` again blindly: the first press may have worked.

| What the CLI says | Likely cause | Next step |
|---|---|---|
| `--capture`: `"status": "no-speech"` | The keys went to another window, the speech is late, or the page says nothing. | `client focus`, check where focus is (a repeated `Tab` moves on), read `speech --since` the marker if there is one. Repeat only if harmless; for slow steps raise `--first-within`. |
| `--capture`: `"status": "timeout"`, exit 1 | Speech didn't pause: a live region, a timer, speech trailing from the previous step. | Judge `entries`; next time add `--settle 500` or raise `--quiet-for` / `--timeout`. |
| `speech` after a step: nothing, or less than expected | The announcement hadn't arrived yet. | See "Late speech is not silence", then read again. |
| `wait`: `"status": "timeout"`, exit 1 | Said differently, or not at all. | Read `entries`; stderr hints at `--normalize` when only case or spaces differ. |
| `client focus`: `NOT_FOUND`, exit 2 | MCP hasn't opened its browser yet, or these MCP tools aren't the bridge's. | Navigate with MCP first. Still `NOT_FOUND`: recheck preflight check 4. |
| `client focus`: `INPUT_DISABLED`, exit 2, but `input.native.available: true` | This bridge can't focus windows. | Use the click fallback (Step 4). |
| `FOCUS_FAILED`, or `INPUT_DISABLED` from `press`, exit 2 | Locked desktop, or no native input on this bridge. | Stop and report: an agent can't fix it. |
| `--since mark:…`: exit 3 | No such marker in the current session. | Mark again; repeat the step if harmless. |
| `BridgeUnreachableError`, exit 2 | Bridge not running, or wrong URL. | `status --wait-ready`, then `config get url`. |

## Step 6: Report

End with `client session end`, then give the user a report (see `references/report-template.md`):
the plan with a pass/fail/unclear verdict per step, the exact speech captured for each (quote it),
what you expected, and the likely cause when you can tell (DOM evidence from MCP). Separate **page
findings** from **environment doubts** (focus, verbosity, screen reader differences) so the user can
tell which to fix. Give each page finding a severity and a WCAG reference, by the rules in the
template. Say plainly what you could not verify, including rehearsal suspicions the run
didn't confirm. Cite the entries' `seq` numbers and the session id so a person can find each step in
the bridge's web UI.

## Ground rules

- Never fabricate speech or assume what the screen reader "would" say; only report what was captured.
- Only one thing drives the screen reader at a time: one session, one browser in front. A browser
  started by Playwright tests and the MCP browser are separate windows.
- Don't change the bridge config, install packages, or touch the user's MCP/CLI settings without
  asking. `config set url` is fine once the user gave you the address.
- Native input is not yet verified on a real VM (ROADMAP M7): `Insert` / `CapsLock` as held
  modifiers and `client focus` with a screen reader running. If `Insert+…` commands do nothing while plain
  keys work, say so rather than concluding the page is broken.
