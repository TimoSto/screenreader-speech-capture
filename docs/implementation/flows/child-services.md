# Child service flows

Sequence diagrams of how `ChildProcessSupervisor` (`adapters/out/process`) runs the Playwright
server and Playwright MCP: prepare (install), spawn, wait for the port, restart after a crash. The
behaviour is described in [Operations → Child service crashes](../../usage/operations.md#child-service-crashes)
and [Remote Playwright & MCP → Install](../../usage/playwright-mcp.md#install).

**Contents**

1. [Start: install, spawn, wait for the port](#start-install-spawn-wait-for-the-port)
2. [Crash and restart with backoff](#crash-and-restart-with-backoff)
3. [Too many crashes in a row](#too-many-crashes-in-a-row)

## Start: install, spawn, wait for the port

`prepare` installs what the version needs (the npm package once per version, Chromium on every
start, a download only when missing). The service is `running` once its port accepts connections,
at most 60 s after the spawn.

```mermaid
sequenceDiagram
    participant S as ChildProcessSupervisor
    participant N as npm-package /<br/>playwright-installer
    participant P as Child process<br/>(playwright run-server / mcp cli.js)

    S->>S: state "starting", log "starting playwright 1.65.0 on 127.0.0.1:3000"
    S->>N: prepare(settings)
    N->>N: npm install playwright@1.65.0 into a temp folder, rename when complete (once)
    N->>N: playwright install --no-shell chromium (downloads only if missing)
    N-->>S: command
    S->>P: spawn (own process group), output piped to the bridge log
    loop every 200 ms, up to 60 s
        S->>P: port 3000 open?
    end
    S->>S: state "running", log "running on ws://…/playwright"
    alt prepare fails (offline, proxy)
        N-->>S: error → counts as a crash
    else port not open in time
        S->>P: kill the process tree → counts as a crash
    end
```

## Crash and restart with backoff

A crash kills what is left of the process tree and restarts after a growing delay (1 s, 2 s, 4 s,
… up to 30 s). 60 s of stable running resets the count (`nextAfterCrash` in the domain).

```mermaid
sequenceDiagram
    participant P as Child process
    participant S as ChildProcessSupervisor
    participant OS as OS process tree
    participant St as GET /status

    P--xS: exit code 1
    S->>OS: kill the rest of its tree (browsers)
    S->>S: nextAfterCrash(crashesInRow, ranForMs) → restart in 1 s
    S->>S: state "crashed", log "playwright exited with code 1, restart 1 in 1 s"
    St-->>St: state "crashed", exitCode 1, restarts 0
    Note over S: 1 s later
    S->>S: restarts = 1, launch (prepare, spawn, wait for the port)
    P--xS: exits again before 60 s
    S->>S: restart 2 in 2 s
```

## Too many crashes in a row

After 5 crashes without 60 s of stable running in between, the supervisor gives up: `failed` until
the bridge restarts, or a `PUT /config` change to the service's section restarts it
([Config flows](config.md)).

```mermaid
sequenceDiagram
    participant P as Child process
    participant S as ChildProcessSupervisor
    participant Ch as ChildServicesService
    participant C as Client

    P--xS: 5th crash in a row
    S->>S: state "failed", log "5 crashes in a row: giving up"
    C->>S: ws://vm:5151/playwright (through the proxy)
    S-->>C: 503 SERVICE_UNAVAILABLE (state: failed)
    C->>Ch: PUT /api/v1/config {"playwright": {"version": "1.66.0"}}
    Ch->>S: reconfigure + restart
    S->>S: state "starting", crash count reset
```
