# Agent flows

Sequence diagrams of an AI agent working with the bridge through the CLI and Playwright MCP.
Details: [Agents](../agents.md), [CLI for agents](../client.md#cli-for-agents).

**Contents**

1. [The agent loop](#the-agent-loop)
2. [Following speech with tail](#following-speech-with-tail)

## The agent loop

One session per task, then per step: **mark → act → wait-silence → text --since**. A CLI call has
no memory, so the marker's `seq` is the step's starting point. The exit codes let the agent branch
without parsing output.

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
    loop each step
        A->>CLI: mark step-1
        CLI->>B: POST /api/v1/markers
        CLI-->>A: seq 120
        alt page interaction
            A->>B: MCP: browser_click / browser_press_key (/playwright-mcp)
            B->>MCP: passthrough
        else screen reader command (planned, M4)
            A->>CLI: press h
            CLI->>B: POST /api/v1/input/keys
        end
        SR->>B: speech (TCP :4449)
        A->>CLI: wait-silence
        CLI->>B: follow the stream until 500 ms quiet
        CLI-->>A: exit 0 (or 1: speech didn't pause)
        A->>CLI: text --since 120 --json
        CLI->>B: GET /api/v1/speech?since=120&session=current
        CLI-->>A: {"text": "…", "truncated": false}
        Note over A: judge what was announced
    end
    A->>CLI: session end
    CLI->>B: POST /api/v1/sessions/end
```

## Following speech with tail

`tail` prints each entry as it arrives until Ctrl+C, `SIGTERM` or a closed pipe. A lost connection
is reconnected without losing entries; a bridge that isn't reachable at the start is exit code `2`.

```mermaid
sequenceDiagram
    participant U as Agent / person
    participant CLI as client CLI (tail --json)
    participant B as Bridge :5151

    U->>CLI: tail --json
    CLI->>B: GET /api/v1/status (version check)
    alt bridge not reachable
        CLI-->>U: error, exit code 2
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
        U->>CLI: Ctrl+C
        CLI-->>U: exit code 0
    end
```
