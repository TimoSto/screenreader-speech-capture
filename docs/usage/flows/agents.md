# Agent flows

Sequence diagrams of an AI agent working with the bridge through the CLI and Playwright MCP.
Details: [Agents](../agents.md), [CLI for agents](../client.md#cli-for-agents).

**Contents**

1. [Preflight](#preflight)
2. [The agent loop](#the-agent-loop)
3. [Recovering from a silent step](#recovering-from-a-silent-step)
4. [Following speech with tail](#following-speech-with-tail)

## Preflight

Before the first step, the agent checks that the setup can work at all, so it doesn't take silence
for a finding. `status --wait-ready` waits for the bridge and its services; the answer says whether
the screen reader is connected (`tcp.connections`) and whether native input and focus work
(`input`). One captured screen reader command then proves the whole chain. Details:
[Preflight](../agents.md#preflight).

```mermaid
sequenceDiagram
    participant A as AI agent
    participant CLI as client CLI
    participant B as Bridge :5151
    participant SR as NVDA / JAWS<br/>+ socket voice

    A->>CLI: status --wait-ready --json
    CLI->>B: GET /api/v1/status (until bridge.state "ready")
    B-->>CLI: {"bridge": {"state": "ready"}, "tcp": {"connections": [1]}, "mcp": {"state": "running"}, "input": {…}}
    CLI-->>A: {"status": "ready", …}, exit 0 (or 1: "not-ready")
    Note over A: stop and report if tcp.connections is empty,<br/>input.native / input.focus unavailable, or mcp not running
    A->>B: MCP: browser_navigate (/playwright-mcp)
    A->>CLI: focus
    CLI->>B: POST /api/v1/input/focus {"target": "mcp"}
    B-->>CLI: {"title": "Checkout - Chromium", "pid": 4242}
    A->>CLI: press Insert+T --capture --json
    CLI->>B: POST /api/v1/input/keys {"keys": "Insert+T", "capture": {}}
    SR->>B: "Checkout - Chromium" (TCP :4449)
    B-->>CLI: {"status": "silent", "entries": […]}
    CLI-->>A: {"pressed": true, "status": "silent", "entries": [{"text": "Checkout - Chromium", …}], …}
    Note over A: the screen reader hears native keys<br/>and reads the MCP browser: start the task
```

## The agent loop

One session per task, `focus` once so native keys reach the MCP browser, then per step either `press … --capture` (a screen reader command: one call
acts and prints the speech it caused), **mark → act → wait-silence → text --since** (an action
through Playwright MCP, which runs in another process), or **mark → act → wait --since** when one
announcement is expected (a status message, a live region). A CLI call has no memory, so the marker
is the step's starting point: `--since mark:<label>` finds it again by its label, in the current
session (`session=active`). The exit codes let the agent branch without parsing output.
Details: [Agent loop](../agents.md#agent-loop).

```mermaid
sequenceDiagram
    participant A as AI agent
    participant CLI as client CLI
    participant B as Bridge :5151
    participant MCP as Playwright MCP
    participant SR as NVDA / JAWS<br/>+ socket voice

    A->>CLI: session start "audit checkout page"
    CLI->>B: POST /api/v1/sessions
    CLI-->>A: session id 7, exit 0
    A->>B: MCP: browser_navigate (/playwright-mcp)
    B->>MCP: passthrough (MCP opens its browser)
    A->>CLI: focus
    CLI->>B: POST /api/v1/input/focus {"target": "mcp"}
    Note over B: finds the window of MCP's browser,<br/>brings it to the front
    B-->>CLI: {"title": "Checkout - Chromium", "pid": 4242}
    Note over SR: the browser is the foreground window
    loop each step
        alt screen reader command
            A->>CLI: press h --capture --json
            CLI->>B: POST /api/v1/input/keys {"keys": "h", "capture": {}}
            Note over B: buffer ends at seq 119, then the key
            SR->>B: speech (TCP :4449)
            Note over B: until 500 ms quiet (by receivedAt)
            B-->>CLI: {"status": "silent", "startSeq": 119, "entries": […]}
            CLI-->>A: {"pressed": true, "status": "silent", "entries": […], "truncated": false}, exit 0 (or 1: "timeout")
        else page interaction
            A->>CLI: mark step-1
            CLI->>B: POST /api/v1/markers
            CLI-->>A: the marker, seq 120 (no need to keep it)
            A->>B: MCP: browser_click / browser_press_key (/playwright-mcp)
            B->>MCP: passthrough
            SR->>B: speech (TCP :4449)
            A->>CLI: wait-silence
            CLI->>B: follow the stream until 500 ms quiet
            CLI-->>A: exit 0 (or 1: speech didn't pause)
            A->>CLI: text --since mark:step-1 --json
            CLI->>B: GET /api/v1/markers/latest?label=step-1&session=active
            B-->>CLI: {"marker": {"seq": 120, …}}
            CLI->>B: GET /api/v1/speech?since=120&session=active
            CLI-->>A: {"text": "…", "truncated": false}
        else one expected announcement
            A->>CLI: mark step-2
            A->>B: MCP: browser_click "Save" (/playwright-mcp)
            SR->>B: "Saved" (live region, TCP :4449)
            A->>CLI: wait "Saved" --since mark:step-2 --json
            CLI->>B: GET /api/v1/markers/latest?label=step-2&session=active
            CLI->>B: read after seq 121, then follow the stream
            CLI-->>A: {"status": "matched", "entry": {…}}, exit 0<br/>(or 1: {"status": "timeout", "entries": […]})
        end
        Note over A: judge what was announced
    end
    A->>CLI: session end
    CLI->>B: POST /api/v1/sessions/end
```

## Recovering from a silent step

A `press … --capture` that hears nothing (`no-speech`) almost always means the keys went to
another window: a dialog, a new window or the bridge console took the foreground. `focus` again and
repeat the step; a step the screen reader is slow to announce needs a larger `--first-within`
instead. Details: [When a step fails](../agents.md#when-a-step-fails).

```mermaid
sequenceDiagram
    participant A as AI agent
    participant CLI as client CLI
    participant B as Bridge :5151
    participant SR as NVDA / JAWS<br/>+ socket voice

    A->>CLI: press h --capture --json
    CLI->>B: POST /api/v1/input/keys {"keys": "h", "capture": {}}
    Note over SR: the keys went to another window
    Note over B: nothing within 2000 ms (firstWithinMs)
    B-->>CLI: {"status": "no-speech", "entries": []}
    CLI-->>A: {"pressed": true, "status": "no-speech", "entries": []}, exit 0
    A->>CLI: focus
    CLI->>B: POST /api/v1/input/focus {"target": "mcp"}
    alt window found
        B-->>CLI: 200 {"title", "pid"}
        A->>CLI: press h --capture --json
        SR->>B: "Shipping, heading level 2"
        CLI-->>A: {"status": "silent", "entries": […]}
    else MCP hasn't opened its browser yet
        B-->>CLI: 404 NOT_FOUND
        CLI-->>A: {"error": {"type": "BridgeHttpError", "code": "NOT_FOUND", …}}, exit 2
        Note over A: navigate with MCP first, then focus
    else Windows refused (locked or disconnected desktop)
        B-->>CLI: 409 FOCUS_FAILED
        CLI-->>A: error object, exit 2
        Note over A: stop and report: nobody can fix it from here
    end
```

## Following speech with tail

`tail` prints each entry as it arrives until Ctrl+C, `SIGTERM` or a closed pipe. A lost connection
is reconnected without losing entries; a bridge that isn't reachable at the start is exit code `2`
([errors with `--json`](../client.md#errors-with---json)). The first `GET /status` only checks that
the bridge answers; the API version comes with every answer, the stream's too
([Versioning](../http-api.md#versioning)).

```mermaid
sequenceDiagram
    participant U as Agent / person
    participant CLI as client CLI (tail --json)
    participant B as Bridge :5151

    U->>CLI: tail --json
    CLI->>B: GET /api/v1/status (is the bridge reachable?)
    alt bridge not reachable
        CLI-->>U: {"error":{"type":"BridgeUnreachableError",…}}, exit code 2
    else reachable
        CLI->>B: GET /api/v1/speech/stream
        B-->>CLI: event: entry seq 41
        CLI-->>U: {"type":"entry","entry":{…}}
        B-->>CLI: event: session
        CLI-->>U: {"type":"session","session":{…}}
        Note over CLI,B: connection lost
        CLI-->>U: stderr: reconnecting
        CLI->>B: GET /api/v1/speech/stream, Last-Event-ID: 41
        B-->>CLI: missed entries, then live
        alt error a reconnect can't fix (HTTP 4xx)
            CLI-->>U: last line {"error":{"type":"BridgeHttpError",…}}, exit code 2
        else
            U->>CLI: Ctrl+C
            CLI-->>U: exit code 0
        end
    end
```
