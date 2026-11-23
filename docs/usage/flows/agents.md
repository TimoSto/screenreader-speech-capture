# Agent flows

Sequence diagrams of an AI agent working with the bridge through the CLI and Playwright MCP.
Details: [Agents](../agents.md), [CLI for agents](../client.md#cli-for-agents).

**Contents**

1. [The agent loop](#the-agent-loop)
2. [Following speech with tail](#following-speech-with-tail)

## The agent loop

One session per task, `focus` once so native keys reach the MCP browser, then per step either `press … --capture` (a screen reader command: one call
acts and prints the speech it caused) or **mark → act → wait-silence → text --since** (an action
through Playwright MCP, which runs in another process). A CLI call has no memory, so the marker's
`seq` is the step's starting point. The exit codes let the agent branch without parsing output.
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
    A->>CLI: focus --script
    CLI-->>A: () => ({ screenX: window.screenX, … })
    A->>B: MCP: browser_evaluate(function)
    B->>MCP: passthrough
    MCP-->>A: {"screenX": 0, "screenY": 0, …}
    A->>CLI: focus --geometry '{…}'
    CLI->>B: POST /api/v1/input/click (title bar)
    Note over SR: the browser is the foreground window
    loop each step
        alt screen reader command
            A->>CLI: press h --capture --json
            CLI->>B: GET /api/v1/status (buffer ends at seq 119)
            CLI->>B: POST /api/v1/input/keys
            SR->>B: speech (TCP :4449)
            CLI->>B: follow the stream until 500 ms quiet
            CLI->>B: GET /api/v1/speech?since=119
            CLI-->>A: {"pressed": true, "entries": […], "truncated": false}, exit 0 (or 1)
        else page interaction
            A->>CLI: mark step-1
            CLI->>B: POST /api/v1/markers
            CLI-->>A: seq 120
            A->>B: MCP: browser_click / browser_press_key (/playwright-mcp)
            B->>MCP: passthrough
            SR->>B: speech (TCP :4449)
            A->>CLI: wait-silence
            CLI->>B: follow the stream until 500 ms quiet
            CLI-->>A: exit 0 (or 1: speech didn't pause)
            A->>CLI: text --since 120 --json
            CLI->>B: GET /api/v1/speech?since=120&session=current
            CLI-->>A: {"text": "…", "truncated": false}
        end
        Note over A: judge what was announced
    end
    A->>CLI: session end
    CLI->>B: POST /api/v1/sessions/end
```

## Following speech with tail

`tail` prints each entry as it arrives until Ctrl+C, `SIGTERM` or a closed pipe. A lost connection
is reconnected without losing entries; a bridge that isn't reachable at the start is exit code `2`
([errors with `--json`](../client.md#errors-with---json)).

```mermaid
sequenceDiagram
    participant U as Agent / person
    participant CLI as client CLI (tail --json)
    participant B as Bridge :5151

    U->>CLI: tail --json
    CLI->>B: GET /api/v1/status (version check)
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
