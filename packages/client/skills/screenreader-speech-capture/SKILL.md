---
name: screenreader-speech-capture
description: Test a web page's screen reader (JAWS/NVDA) output by driving a real browser on a Windows VM through the screenreader-speech-capture bridge, its client CLI and Playwright MCP, then judging what the screen reader said after every step. Use this whenever the user wants to audit, test or verify screen reader behaviour, accessibility announcements, focus order, keyboard navigation, live regions, form labels or "what does JAWS/NVDA say" on a page or user flow, even if they only say "a11y-test this page", "check what the screen reader announces" or mention the bridge, speech capture or the client CLI.
---

# Screen reader testing with the speech-capture bridge

You test a page the way a screen reader user experiences it: put the real browser in the OS
foreground, move focus and trigger actions, and after **every** step read what the screen reader
actually said and judge it. The bridge records the speech; you supply the steps and the judgement.

Two input paths exist, and the difference matters:

- **Playwright MCP** sends input over CDP. The page reacts and the screen reader announces the
  resulting focus/value changes, but the screen reader never sees the keys. Use it to navigate,
  click, type, and inspect the DOM.
- **`press` (native OS input via the CLI)** sends real keys. Only these reach the screen
  reader's own hook, so browse-mode keys (`h`, `k`, `Insert+T`, virtual cursor) need it. Use it for
  Tab/Shift+Tab too when you want the faithful keyboard-user path.

`client` below means `npx screenreader-speech-capture-client` (or the globally installed binary).
Add `--json` when you parse output. Exit codes: 0 ok/match, 1 timeout/no match, 2 bridge
unreachable/HTTP error/incompatible version/`INPUT_DISABLED`, 3 bad usage or config.

## Step 0: Preflight (do this first, stop and help the user if something fails)

1. **CLI installed?** `client --version` (try the bare binary `screenreader-speech-capture-client --version`
   first, else `npx --yes screenreader-speech-capture-client --version`). If missing, tell the user and offer
   `npm i -g screenreader-speech-capture-client`; do not install without a yes.
2. **Bridge URL configured?** `client config get url --json`. `source: "default"` means nobody
   set it, and `localhost:5151` is only right if the bridge runs on this machine. Ask the user for the
   VM's address (`http://<vm>:5151`) and run `client config set url <url>`. (`SR_SPEECH_URL`
   or `--url` override the stored value.) Note: this is the *bridge* URL, not the page under test.
3. **Bridge reachable and ready?** `client status --wait-ready --json`. Check `bridge.state` is `ready`,
   `playwright`/`mcp` state is running, and `tcp.connections` is non-empty (the SAPI voice is
   connected). First start can take minutes (Chromium download). Exit 2 with a version message means
   client and bridge API majors differ.
   A hostname that is not an IP needs `http.allowedHosts` on the bridge (403 otherwise).
4. **Playwright MCP available?** Look for `browser_navigate`/`browser_evaluate` tools. If absent, give the
   user the registration (URL is `http://<vm>:5151/playwright-mcp`, streamable HTTP):
   `claude mcp add --transport http screenreader-vm http://<vm>:5151/playwright-mcp`, then they restart
   the session. Do not edit their config yourself.
5. **Native input works?** Do not guess; you will learn it at the focus step: `press`/`click` exiting 2
   with `INPUT_DISABLED` means the bridge is not on Windows, robotjs is missing, or it is not running
   non-elevated in an unlocked interactive session. Report that precisely and stop.

## Step 1: Gather context

Ask whether the user has markdown files (specs, user stories, component docs, a11y requirements)
describing what the page does, and read any they give (paths may be passed as arguments). Also get the
**page URL** and whether it needs a login (the MCP browser starts with a fresh profile every session, so
there are no cookies; credentials must come from the user, never invent them).

## Step 2: Interview before touching anything

Interview the user until the workflow is unambiguous. Ask in small batches (2-4 questions), pick the next
questions from the previous answers, and offer your best guess as the default so they can just confirm.
Skip questions the context files already answer, but state your assumption. Cover:

- **Workflow**: the exact start state and end goal ("sign in, add item to cart, reach confirmation").
  Which steps, in which order? Happy path only, or also errors (empty required field, wrong password)?
- **Navigation style**: sequential Tab/keyboard flow, screen reader browse mode (headings/landmarks/
  forms), or both?
- **Expectations**: what should be announced at each important step (names, roles, states, error
  messages, live-region updates, page title on load)? Which wordings are mandatory, which are flexible?
- **Screen reader and verbosity**: NVDA or JAWS, language, verbosity. Wording depends on all of these,
  so assertions should match meaning (regex or `--normalize`), not exact strings.
- **Done criteria and scope**: what counts as a failure? Which areas are out of scope? Any steps that
  have side effects (purchases, emails, deletions) that must not be triggered?

Finish by writing the plan back as a numbered list of steps, each with action + expected announcement, and
get a yes before executing. The plan is the contract; without it you cannot tell "unexpected" from
"expected" later.

## Step 3: Start the run and put the browser in the foreground

1. `client session start "<short task name>"`. A session scopes your reads and waits to this task. Prefer it
   over `clear`, which wipes everything. Only one screen reader exists, so never run two sessions in
   parallel.
2. Open the page: MCP `browser_navigate` to the page URL.
3. **Foreground focus.** MCP does not change the OS foreground window and the screen reader follows
   that window. There is no `focus` CLI command. Use `click`:
   read the window geometry with MCP `browser_evaluate`:
   `() => ({x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, chromeH: window.outerHeight - window.innerHeight, dpr: window.devicePixelRatio})`
   then click the title bar (empty top area), in physical pixels:
   `client click --x <round((x + w/2) * dpr)> --y <round((y + 10) * dpr)>`
   Use `--x=-5` syntax for negative values. The title bar is safer than page content, since a click in
   the page activates whatever is under it. Display scaling other than 100% is unverified in the docs, so if
   the screen reader stays silent, check the geometry before anything else.
4. Verify focus worked: `client wait-silence` then `client text --json`; the screen reader should have
   announced the window/page (title). If nothing, retry the click once, then report it. Do not carry on
   blind, because all later results would be meaningless.
5. Anchor focus in the page when needed: check `document.activeElement` with `browser_evaluate`. Focus
   starting in the browser's address bar makes the first Tab land in browser chrome.

Redo step 3 after anything that steals the foreground: new window or tab, popup, dialog, file picker.

## Step 4: The step loop

For every step in the plan:

```
SEQ=$(client mark "step-N <what>")      # 1. a start point; speech arrives within ms of the action
<act>                                   # 2. MCP tool, or: client press tab | client press h | client press "Insert+T"
client wait-silence --quiet-for 800     # 3. let the announcement finish (default quiet is 500 ms)
client text --since "$SEQ" --json      # 4. read exactly this step's speech
```

Why this order: the marker must come before the action because `--since` means "entries after this
seq" and speech can land before a later-started wait. If you know the phrase, `client wait "<text>"
--since "$SEQ" --normalize` (or `--regex`) is more direct than silence and also matches speech that
arrived before the call. Defaults: `wait` 5000 ms, `wait-silence` 500 ms quiet / 10000 ms timeout.
Exit 1 means timeout, not failure of the page: read the output and decide.

Pick the input path per step:

| Goal | Use |
|---|---|
| Navigate, click, type, fill forms, read DOM | MCP |
| Keyboard-user focus movement (Tab, Shift+Tab, Enter, Space, arrows) | `client press tab` etc., faithful to a real user |
| Screen reader commands (`h`, `k`, `d`, `Insert+T`, `Insert+Down`) | `client press` only |
| Check *where* focus actually is | MCP `browser_evaluate` on `document.activeElement` (or snapshot) |

Combine them to cross-check: after `client press tab`, compare the announcement with the focused
element's accessible name/role from an MCP snapshot. A mismatch between DOM and speech is the most
valuable kind of finding.

Judge each step immediately against the plan, in these terms:

- **Name, role, state/value** are all announced (e.g. "Email, edit, required"), not just one of them.
- **Order** follows the visual/logical order, with no skipped or trapped elements.
- **Changes** (errors, status, dialog open/close, live regions) are announced without needing focus.
- **Noise**: duplicate, missing, or misleading speech, unlabeled controls ("button", "link" only), raw
  file names or ids. Chromium window/tab-title announcements and speech from the bridge console are not
  page bugs; mention them as noise, not findings.
- **Silence** after an action that should announce something is a finding, but first rule out the
  environment (wrong foreground window, headless browser, voice disconnected via `client status`).

Interrupted speech is still recorded, so the log can show more than a listener would hear. Treat "very
short, quickly replaced" announcements with care.

If speech is truncated (`truncated: true`), the buffer dropped entries; re-run the step with a smaller
scope instead of trusting partial text.

## Step 5: Report

End with `client session end`, then give the user a report (see `references/report-template.md`): the
plan with a pass/fail/unclear verdict per step, the exact speech captured for each (quote it), what you
expected, and the likely cause when you can tell (DOM evidence from MCP). Separate **page findings** from
**environment doubts** (focus, verbosity, screen reader differences) so the user can tell which to fix.
Say plainly what you could not verify. The `--json` `session`/`speech` entries carry `seq` numbers; cite
them so a human can find the step in the bridge's web UI.

## Ground rules

- Never fabricate speech or assume what the screen reader "would" say; only report what was captured.
- Only one thing drives the browser at a time. A browser started by Playwright tests and the MCP
  browser are separate windows.
- Do not change the bridge config, install packages, or touch the user's MCP/CLI settings without
  asking. `config set url` is fine once the user gave you the address.
- Native input and the VM setup are not yet verified on a real VM in the project docs (ROADMAP M7).
  If keys like `Insert+...` do nothing, say so rather than concluding the page is broken.
- Additional detail: `references/cli-cheatsheet.md` (commands, flags, json shapes, key names).
