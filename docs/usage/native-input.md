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

So the bridge has two native-input endpoints, both built on
[`@jitsi/robotjs`](https://github.com/jitsi/robotjs) (a maintained robotjs fork with prebuilt binaries):

- **`POST /api/v1/input/click`** does a real mouse click at screen coordinates. The browser window becomes
  the foreground window, and the screen reader starts reading it. After that, Playwright input works as usual.
- **`POST /api/v1/input/keys`** sends real key presses, for screen reader commands.

The bridge doesn't own the page, so it doesn't know where the browser window is. The
**client calculates the coordinates**. `setFocus(page)` reads `window.screenX/Y`, the difference
between the outer and inner window size, and `devicePixelRatio` through `page.evaluate`. From those
it computes a safe click point: the window's title bar by default, or the centre of a `target`
element you pass. Then it calls `/api/v1/input/click`.

**Which keys to use:**

| Goal | Use |
|---|---|
| Interact with the page (Tab, type, Enter on a button) | Playwright: `page.keyboard.press('Tab')` |
| Give the screen reader a command (next heading, read title, elements list) | Native: `speech.pressKeys('h')`, `speech.pressKeys('Insert+T')` |
| Before either: make the browser the foreground window | `speech.setFocus(page)` (title bar). The [Playwright fixture](client.md#playwright-fixture) does it automatically with its own `setFocus()`: a click on the top-left corner of the page content, then a reload. An agent without a `page` (Playwright MCP) uses the CLI's [`focus`](client.md#cli-for-agents): the same script and title-bar click, with the script run through MCP's `browser_evaluate` |

**Key names** (`/api/v1/input/keys`): keys are joined with `+` for chords (`Insert+T`, `Control+Home`)
and passed as an array for sequences (`["h", "h", "Insert+Down"]`). Names follow robotjs
(`a`–`z`, `0`–`9`, `enter`, `tab`, `escape`, `up`, `down`, `left`, `right`, `home`, `end`,
`pageup`, `pagedown`, `f1`–`f12`, `space`, `backspace`, `delete`, `insert`, `capslock`), case-insensitive. `Ctrl`, `Esc`, `Return`, `Del`, `Ins`, `PgUp`, `PgDn`, `Windows` and `Meta` are accepted as aliases. A name the bridge doesn't know answers `400 INVALID_REQUEST` with `details.field` `keys`, before any key is sent. The rule is part of the contract (`packages/shared/src/key-chord.ts`): the CLI's `press` checks the keys with it before sending (a usage error, exit `3`) and lists the names in `--help`. A request holds at most 100 chords; `delayMs` (default 50, at most 10000) pauses between them.
Modifiers are `Control`, `Shift`, `Alt`, `Win`. `Insert` and `CapsLock` also work as modifiers,
because NVDA and JAWS use them as their screen reader key: they are held down with `keyToggle`
while the other keys are pressed.

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
- Native input goes to whatever window is in the foreground. Call `setFocus` again after anything
  that could steal focus (a new window, a dialog, the MCP browser).

**When input is not available** (not on Windows, or robotjs failed to load), the bridge still starts,
logs why under `[native-input]`, and both endpoints answer `409 INPUT_DISABLED` with the reason in
`error.message`. Clients throw a `BridgeHttpError` with that code, and the CLI exits with 2.

Not verified on a real VM yet ([M7](../ROADMAP.md#m7-distribution-)): whether `Insert` and `CapsLock`
work as held modifiers through robotjs, and the click point at other display scalings.

People can send the same clicks and keys by hand from the [web UI](web-ui.md#actions).
