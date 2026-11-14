# Native input flows

> **Planned ([M4](../../ROADMAP.md#m4-native-input-)), not implemented yet.** These diagrams show the design.

Sequence diagrams of real OS clicks and key presses, for what Playwright input can't do. Details:
[Native input](../native-input.md).

**Contents**

1. [Why Playwright keys don't reach the screen reader](#why-playwright-keys-dont-reach-the-screen-reader)
2. [Bring the browser to the front](#bring-the-browser-to-the-front)
3. [Send a screen reader command](#send-a-screen-reader-command)
4. [Input is off](#input-is-off)

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

The screen reader follows the OS foreground window, which `page.bringToFront()` doesn't change. The
bridge doesn't know where the window is, so the client computes the click point and the bridge
clicks there.

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Client library
    participant Br as Browser (page)
    participant B as Bridge :5151
    participant OS as Windows input
    participant SR as NVDA / JAWS

    T->>C: setFocus(page)
    C->>Br: page.evaluate: screenX/Y, outer − inner size, devicePixelRatio
    Br-->>C: window geometry
    Note over C: click point = title bar<br/>(or the centre of target), in physical pixels
    C->>B: POST /api/v1/set-focus {"x": 640, "y": 12, "button": "left"}
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

## Input is off

With `--no-input`, not on Windows, or when robotjs failed to load, both endpoints refuse, and the
status says why.

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Bridge :5151<br/>(--no-input)

    C->>B: POST /api/v1/input/keys {"keys": "h"}
    B-->>C: 409 INPUT_DISABLED
    C->>B: GET /api/v1/status
    B-->>C: input: { enabled: false, reason: "--no-input" }
```
