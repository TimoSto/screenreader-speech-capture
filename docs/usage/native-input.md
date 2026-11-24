# Native input

Real OS mouse clicks and key presses, for things Playwright input cannot do.

Flows: [Native input](flows/native-input.md).

Playwright sends keys and clicks **into the browser** through its browser protocol (CDP for
Chromium). The operating system, and so the screen reader, never sees them. This is how it plays
out:

| What you do | Works with Playwright input? | Why |
|---|---|---|
| `Tab`, typing, clicking buttons | **Yes** | Focus and value changes happen in the page. The screen reader announces them through the accessibility API. |
| Screen reader commands: NVDA browse mode `H` / `K` / arrows, `Insert+T`, `Insert+F7`, JAWS virtual cursor | **No** | The screen reader catches these keys with a keyboard hook *before* the browser gets them. Synthetic browser keys skip that hook. |
| Making the browser the active window | **No** | `page.bringToFront()` only switches tabs. The screen reader follows the **OS foreground window**. |

So the bridge has three native-input endpoints:

- **`POST /api/v1/input/focus`** brings the window of a browser the bridge started (Playwright MCP's,
  or one its Playwright server launched for a test) to the front, so the screen reader reads it. See
  [Bringing the browser to the front](#bringing-the-browser-to-the-front).
- **`POST /api/v1/input/click`** does a real mouse click at screen coordinates, built on
  [`@jitsi/robotjs`](https://github.com/jitsi/robotjs) (a maintained robotjs fork with prebuilt
  binaries). A click also makes a window the foreground window: the fallback for browsers the bridge
  didn't start.
- **`POST /api/v1/input/keys`** sends real key presses (robotjs), for screen reader commands.

For the click fallback the **client calculates the coordinates**, because the bridge doesn't know
where that window is. `setFocus(page)` reads `window.screenX/Y`, the difference between the outer and
inner window size, and `devicePixelRatio` through `page.evaluate`. From those it computes a click
point: the window's title bar by default, or the centre of a `target` element you pass. Then it
calls `/api/v1/input/click`.

**Which keys to use:**

| Goal | Use |
|---|---|
| Interact with the page (Tab, type, Enter on a button) | Playwright: `page.keyboard.press('Tab')` |
| Give the screen reader a command (next heading, read title, elements list) | Native: `speech.pressKeys('h')`, `speech.pressKeys('Insert+T')` |
| Before either: make the browser the foreground window | `speech.setFocus(page)`: the bridge brings the window forward if it started the browser, otherwise a title-bar click. The [Playwright fixture](client.md#playwright-fixture) does it automatically with its own `setFocus()` (its fallback: a click on the top-left corner of the page content, then a reload). An agent (Playwright MCP) runs the CLI's [`focus`](client.md#cli-for-agents) without options; `focus --script` / `--geometry` is the click fallback |

**Key names** (`/api/v1/input/keys`): keys are joined with `+` for chords (`Insert+T`, `Control+Home`)
and passed as an array for sequences (`["h", "h", "Insert+Down"]`). Names follow robotjs
(`a`–`z`, `0`–`9`, `enter`, `tab`, `escape`, `up`, `down`, `left`, `right`, `home`, `end`,
`pageup`, `pagedown`, `f1`–`f12`, `space`, `backspace`, `delete`, `insert`, `capslock`), case-insensitive. `Ctrl`, `Esc`, `Return`, `Del`, `Ins`, `PgUp`, `PgDn`, `Windows` and `Meta` are accepted as aliases. A name the bridge doesn't know answers `400 INVALID_REQUEST` with `details.field` `keys`, before any key is sent. The rule is part of the contract (`packages/shared/src/key-chord.ts`): the CLI's `press` checks the keys with it before sending (a usage error, exit `3`) and lists the names in `--help`. A request holds at most 100 chords; `delayMs` (default 50, at most 10000) pauses between them.
Modifiers are `Control`, `Shift`, `Alt`, `Win`. `Insert` and `CapsLock` also work as modifiers,
because NVDA and JAWS use them as their screen reader key: they are held down with `keyToggle`
while the other keys are pressed.

## Bringing the browser to the front

`POST /api/v1/input/focus` `{ "target": "mcp" | "playwright", "title"?: "…" }` (since API 1.21)
makes a window of a browser the bridge started the foreground window, without a click:

1. The bridge supervises Playwright MCP and the Playwright server, so it knows their process ids.
   The browsers they launch are processes below them.
2. It lists the visible top-level windows, front to back, and keeps those owned by a process of
   that tree that have a title. With `title`, only the ones whose title contains it.
3. It restores the window if it is minimised and makes it the foreground window. Windows only lets
   a background process do that in some cases, so the bridge first taps Alt (it is then the process
   that sent the last input), and if the window still isn't in front, tries again attached to the
   input thread of the window that is. It answers `200 { "title", "pid" }` once the window is in
   front.

The screen reader follows the foreground window, and the browser puts the focus back where it was
in the page. Unlike a click, this doesn't depend on display scaling or where the title bar is.

**Which window.** MCP usually has one browser window: without `title`, the front-most one of its
tree. The Playwright server can run several browsers at once, each with several windows. So
`setFocus(page)` and the fixture put a unique marker into `document.title` for a moment
(`sr-focus-<random>`). The browser shows it in the window title, and the client sends it as
`title`. The bridge waits up to 2 seconds for it to show up, then the client puts the page title
back.

**Answers.** `404 NOT_FOUND`: the service isn't running, MCP hasn't opened its browser yet (it does
on its first browser tool call), or no window has `title` (a browser the bridge didn't start). The
client then falls back to the click. `409 INPUT_DISABLED`: not on Windows, or the optional
dependency [`koffi`](https://koffi.dev/) (which calls the Win32 functions) could not be loaded; the
client falls back too. `409 FOCUS_FAILED`: Windows refused, for example on a locked desktop; that is
an error, not a fallback. The request runs in the input queue, so a focus and a key press never
interleave.

## Capturing the speech an input causes

Both endpoints take an optional `capture` object (since API 1.19). With it, the bridge sends the
input, records the speech the screen reader says about it, and answers `200` with that speech
instead of `204`. This is what the CLI's `--capture` and the library's `recordKeys` / `recordClick`
use ([client](client.md#functions)):

```bash
curl -X POST $VM/api/v1/input/keys -H 'content-type: application/json' \
  -d '{"keys":"h","capture":{"quietForMs":500}}'
# → {"status":"silent","startSeq":4711,"entries":[{"seq":4712,"text":"Heading level 1, Welcome",…}],
#    "omitted":0,"truncated":false}
```

| `capture` field | Default | Meaning |
|---|---|---|
| `firstWithinMs` | 2000 (max 300000) | How long the first speech may take after the input. |
| `quietForMs` | 500 (1 to 60000) | The capture ends when nothing was spoken for this long. |
| `timeoutMs` | 10000 (max 300000) | Longest capture, counted from the input. |
| `settleMs` | 0 (max 60000) | Before the input, wait until nothing was spoken for this long, so speech still trailing from the previous step isn't captured. Waits at most `timeoutMs`, then sends the input anyway. |

The answer's `status` is `silent` (speech came and paused), `no-speech` (nothing within
`firstWithinMs`) or `timeout` (speech went on until `timeoutMs`; `entries` holds what was said until
then). All three are results: the input was sent. `entries` are the speech entries after `startSeq`
(no markers, the first 10000; `omitted` counts the rest), `truncated` says that some were dropped
from the full buffer.

Why on the bridge, not in the client:

- **The start is exact.** The bridge reads the newest `seq` inside the input queue, right before the
  input. No other input, and no speech that arrived before the input, gets into the capture; a
  client would read it one round trip earlier.
- **Silence is timed where the speech arrives**, from the entries' `receivedAt`, so network jitter
  on the way to the client doesn't look like a pause or like speech.
- **One request** instead of a status read, the input, a live feed and a read.

`settleMs` holds the input queue while it waits, so other input waits too. A client that hangs up
ends the capture; a shutdown answers `503`.

**Caveats:**

- The bridge must run **non-elevated in the logged-in user session**. Windows (UIPI) blocks input
  from or to elevated windows, and input can't reach a locked or disconnected desktop.
- Use a fixed screen resolution and **100 % display scaling** on the VM. With other scaling
  the client corrects for `devicePixelRatio`, but browser zoom and multi-monitor setups can still
  move the click point.
- Native input goes to whatever window is in the foreground. Call `setFocus` (or `focus` in the
  CLI) again after anything that could steal focus (a new window, a dialog, the MCP browser).

**When input is not available** (not on Windows, or robotjs failed to load), the bridge still starts,
logs why under `[native-input]`, and both endpoints answer `409 INPUT_DISABLED` with the reason in
`error.message`. Clients throw a `BridgeHttpError` with that code, and the CLI exits with 2. To
check before a run, read `input` in `GET /status` (since API 1.24; `sr-speech status` prints it):
`native` for keys and clicks, `focus` for bringing windows to the front, each with `available`,
the `backend` and the `reason` when it is off.

Not verified on a real VM yet ([M7](../ROADMAP.md#m7-distribution-)): whether `Insert` and `CapsLock`
work as held modifiers through robotjs, and the click point at other display scalings.

People can send the same clicks and keys by hand from the [web UI](web-ui.md#actions).
