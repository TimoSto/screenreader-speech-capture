# Native input flows

Sequence diagrams of the bridge's input side through its layers: the input queue, a capture and
bringing a window to the front. The design is in
[Architecture → Native input in the bridge](../architecture.md#native-input-in-the-bridge), what
clients see in the [usage flows](../../usage/flows/native-input.md).

**Contents**

1. [A key press with capture](#a-key-press-with-capture)
2. [Bringing a window to the front](#bringing-a-window-to-the-front)

## A key press with capture

`InputCaptureService` hands `NativeInputService` a `beforeInject` hook that runs **inside** the
input queue: settle, then read the start `seq` (`SpeechLog.headSeq`), then the keys. Nothing can get
between the start and the input
([decision](../decisions.md#captures-of-native-input-run-on-the-bridge)). The recording itself runs
after the queue task, so the next input can already be sent; its speech then lands in this capture
too, if it comes before the silence.

```mermaid
sequenceDiagram
    participant R as input route<br/>(adapters/in/http)
    participant C as InputCaptureService
    participant N as NativeInputService<br/>(input queue)
    participant I as InputInjector<br/>(robotjs)
    participant Log as SpeechLog
    participant F as followLog
    participant Clk as Clock

    R->>C: keys("h", capture)
    C->>C: parse options (CAPTURE_LIMITS)
    C->>N: keys("h", beforeInject)
    Note over N: waits for earlier input in the queue
    opt settleMs > 0
        N->>C: beforeInject: settle
        C->>Clk: sleep until the newest entry is settleMs old (at most timeoutMs)
    end
    N->>C: beforeInject: startSeq = Log.headSeq (4711)
    N->>I: keyDown modifiers, keyTap h, keyUp
    N-->>C: sent (queue free for the next input)
    C->>F: follow(after 4711)
    F-->>C: entries (replay, then live)
    Note over C: deadline = first entry? last receivedAt + quietForMs<br/>: sentAt + firstWithinMs (capped at timeoutMs)
    C->>Clk: sleep until the deadline (re-armed on each entry)
    C->>C: status from the entries' receivedAt:<br/>no-speech / silent / timeout
    C-->>R: {status, startSeq, entries (first 10 000), omitted, truncated}
```

A client that disconnects aborts the capture (`AbortSignal`); `shutdown()` aborts every pending one
with `SERVICE_UNAVAILABLE`.

## Bringing a window to the front

`WindowFocusService` holds the rules (which process tree, which window, how long to wait for a
title marker); `WindowSystem` only reports facts and does the Win32 calls. The focus runs in the same
input queue, so it never interleaves with a key press.

```mermaid
sequenceDiagram
    participant R as focus route
    participant W as WindowFocusService
    participant Sup as Supervisor<br/>(mcp / playwright)
    participant N as InputQueue
    participant WS as WindowSystem<br/>(win32 on koffi)

    R->>W: focus({target: "playwright", title: "sr-focus-k3x9"})
    W->>W: check target and title (INVALID_REQUEST)
    W->>Sup: pid()
    alt not running
        W-->>R: AppError NOT_FOUND
    end
    W->>N: exclusive(…)
    loop until the title shows up (at most 2 s)
        W->>WS: process tree below pid, top-level windows front to back
        W->>W: first window of the tree with a title containing the marker
    end
    alt no window
        W-->>R: AppError NOT_FOUND
    end
    W->>WS: bringToFront(window): Alt tap, SetForegroundWindow,<br/>else AttachThreadInput and retry
    alt Windows refused
        WS-->>W: false
        W-->>R: AppError FOCUS_FAILED
    else
        WS-->>W: true
        W-->>R: {title, pid}
    end
```

Without koffi, or not on Windows, `DisabledWindowSystem` throws `INPUT_DISABLED` on the first call;
the client then falls back to a click.
