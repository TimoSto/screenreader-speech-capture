# Native input flows

Sequence diagrams of real OS clicks and key presses, for what Playwright input can't do. Details:
[Native input](../native-input.md).

**Contents**

1. [Why Playwright keys don't reach the screen reader](#why-playwright-keys-dont-reach-the-screen-reader)
2. [Bring the browser to the front](#bring-the-browser-to-the-front)
3. [Send a screen reader command](#send-a-screen-reader-command)
4. [Capture the speech a command causes](#capture-the-speech-a-command-causes)
5. [Input is not available](#input-is-not-available)

## Why Playwright keys don't reach the screen reader

Playwright sends keys into the browser through its protocol (CDP for Chromium). The screen reader
catches its commands with an OS keyboard hook *before* the browser, so it never sees them.

```mermaid
sequenceDiagram
    participant T as Test
    participant B as Bridge :5151
    participant Br as Browser
    participant OS as Windows input
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>Br: page.keyboard.press('h') via CDP
    Note over SR: the hook sees nothing
    Br->>Br: types "h" into the page
    T->>B: POST /api/v1/input/keys {"keys": "h"}
    B->>OS: robotjs key tap
    OS->>SR: keyboard hook: browse mode "next heading"
    SR->>Br: moves the virtual cursor
    SR->>B: "Shipping, heading level 2" (TCP :4449)
```

## Bring the browser to the front

The screen reader follows the OS foreground window, which `page.bringToFront()` doesn't change. If
the bridge started the browser (its Playwright server or MCP), it finds the window by a title
marker and brings it forward itself. Otherwise the client computes a click point and the bridge
clicks there. Details: [Bringing the browser to the front](../native-input.md#bringing-the-browser-to-the-front).

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant Br as Browser (page)
    participant B as Bridge :5151
    participant OS as Windows (user32)
    participant SR as NVDA / JAWS

    T->>C: setFocus(page)
    C->>Br: document.title = "sr-focus-k3x9"
    C->>B: POST /api/v1/input/focus {"target": "playwright", "title": "sr-focus-k3x9"}
    B->>OS: processes below the Playwright server, their top-level windows
    OS-->>B: "sr-focus-k3x9 - Chromium" (pid 4242), …
    B->>OS: Alt tap, SetForegroundWindow
    OS->>Br: browser window becomes foreground
    SR->>SR: reads the new foreground window
    B-->>C: 200 {"title": "sr-focus-k3x9 - Chromium", "pid": 4242}
    C->>Br: document.title = original title
    Note over C,B: fallback, on 404 or 409 INPUT_DISABLED<br/>(a browser the bridge didn't start, not Windows)
    C->>Br: page.evaluate: screenX/Y, outer − inner size, devicePixelRatio
    Br-->>C: window geometry
    Note over C: click point = title bar<br/>(or the centre of target), in physical pixels
    C->>B: POST /api/v1/input/click {"x": 640, "y": 12, "button": "left"}
    B->>OS: robotjs: move + click
    OS->>Br: browser window becomes foreground
    SR->>SR: reads the new foreground window
    B-->>C: 204
```

## Send a screen reader command

Chords are held with `keyToggle` (`Insert` and `CapsLock` work as modifiers, as the screen reader
key); sequences are sent one after the other with `delayMs` between them.

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant B as Bridge :5151
    participant OS as Windows input
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>C: pressKeys('Insert+T')
    C->>B: POST /api/v1/input/keys {"keys": "Insert+T"}
    B->>OS: keyToggle Insert down, tap T, Insert up
    OS->>SR: keyboard hook: "read window title"
    B-->>C: 204
    SR->>B: "Checkout - Google Chrome" (TCP :4449)
    T->>C: waitForOutput(/Checkout/)
    C-->>T: entry
```

## Capture the speech a command causes

With `capture`, the bridge notes the newest `seq` in the input queue right before the keys, then
follows the speech after it and times the silence from the entries' `receivedAt`. Details:
[Capturing the speech an input causes](../native-input.md#capturing-the-speech-an-input-causes).

```mermaid
sequenceDiagram
    participant T as Test / CLI
    participant C as Client library
    participant B as Bridge :5151
    participant OS as Windows input
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>C: recordKeys('h') / press h --capture
    C->>B: POST /api/v1/input/keys {"keys": "h", "capture": {"quietForMs": 500}}
    opt settleMs > 0
        Note over B: wait until the newest speech is settleMs old
    end
    Note over B: in the input queue: startSeq = newest seq (4711)
    B->>OS: robotjs key tap
    OS->>SR: keyboard hook: "next heading"
    SR->>B: "Shipping, heading level 2" (TCP :4449)
    Note over B: up to firstWithinMs for the first speech,<br/>then until quietForMs without speech
    B-->>C: 200 {"status": "silent", "startSeq": 4711, "entries": […]}
    C-->>T: { entries, truncated, startSeq }
```

## Input is not available

Not on Windows, or when robotjs failed to load: the bridge starts anyway, and both endpoints refuse
with the reason.

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Bridge :5151<br/>(robotjs not loaded)

    C->>B: POST /api/v1/input/keys {"keys": "h"}
    B-->>C: 409 INPUT_DISABLED (message names the reason)
```
