# Lifecycle flows

Sequence diagrams of how the bridge starts and stops, as wired in `main.ts` / `composition/` and
driven by `BridgeLifecycleService`. The behaviour is described in
[Operations](../../usage/operations.md#startup).

**Contents**

1. [Startup](#startup)
2. [Shutdown](#shutdown)

## Startup

The TCP listener starts first, so no speech is lost while the rest starts. The child services
start in the background: the API already answers while they install and start, and
`bridge.state` turns `ready` once each enabled one is running or has failed.

```mermaid
sequenceDiagram
    participant CLI as cli.ts
    participant Main as startBridge (main.ts)
    participant Cfg as load-config
    participant TCP as TcpListener
    participant HTTP as HttpServer
    participant LC as BridgeLifecycleService
    participant CS as ChildServicesService

    CLI->>Main: flags + env
    Main->>Cfg: flags > env > config.json > defaults
    alt invalid value
        Cfg-->>CLI: error naming flag / variable / file, exit code 2
    end
    Main->>TCP: start(config.tcp)
    alt port in use
        TCP-->>CLI: ListenError, exit (no other port is tried)
    end
    Main->>HTTP: start(config.http)
    Note over HTTP: answers now, state "starting"
    Main->>LC: start()
    LC->>CS: startEnabled() (not awaited by main)
    CS->>CS: each supervisor: install if needed, spawn, wait for its port
    CS-->>LC: each one running or failed
    LC->>LC: state "ready", log "ready"
```

## Shutdown

On `SIGINT`, `SIGBREAK`, `SIGHUP`, `SIGTERM` or a crash, `stop()` runs once. Each part stops even
if the one before failed; the child services go last and their whole process tree is killed.

```mermaid
sequenceDiagram
    participant Sig as Signal handler<br/>(adapters/in/cli)
    participant LC as BridgeLifecycleService
    participant W as Pending waits
    participant HTTP as HttpServer
    participant TCP as TcpListener
    participant CS as ChildServicesService
    participant OS as OS process tree

    Sig->>LC: stop("SIGINT")
    LC->>LC: state "stopping", log "stopping (SIGINT)"
    LC->>W: shutdown(): pending waits answer 503
    LC->>HTTP: stop (no new connections, SSE streams end)
    LC->>TCP: stop
    LC->>CS: stopAll()
    CS->>OS: Windows: taskkill /T /F /PID<br/>Linux/macOS: SIGTERM to the group, SIGKILL after 3 s
    LC-->>Sig: done (log "stopped")
    Sig->>Sig: flush console, exit 0 (1 if a step failed)
    Note over Sig: a step hangs: exit 1 after 10 s<br/>a second signal: exit 1 at once
```
