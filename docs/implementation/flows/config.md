# Config flows

Sequence diagram of a live configuration change through the hexagon: the HTTP adapter,
`ConfigService`, the re-apply wiring in `composition/reapply.ts`, and the parts that apply a
change. The user-facing rules are in
[Configuration → Changing settings](../../usage/configuration.md#changing-settings).

**Contents**

1. [PUT /config through the layers](#put-config-through-the-layers)

## PUT /config through the layers

Updates run one at a time (a queue in `ConfigService`). The file is saved first, so a write error
changes nothing. Restart-only settings (`RESTART_FIELDS` in `domain/config/restart.ts`) are kept at
their running values by `liveConfig` and reported in `restartRequired`. Each `onChange` listener
runs even if the one before failed.

```mermaid
sequenceDiagram
    participant C as Client
    participant R as config-routes<br/>(adapters/in/http)
    participant CS as ConfigService
    participant F as FsConfigStore<br/>(config.json)
    participant RA as reapply.ts listeners
    participant H as HttpServer
    participant Buf as SpeechLog buffer
    participant Log as BridgeLog
    participant Ch as ChildServicesService

    C->>R: PUT /api/v1/config {"buffer": {...}, "playwright": {"version": "1.66.0"}, "tcp": {"port": 4450}}
    R->>CS: update(patch) (queued)
    CS->>CS: validatePatch (invalid → 400, nothing changed)
    CS->>CS: next = liveConfig(mergeConfig(active, patch), active)
    CS->>F: save(file settings + patch)
    CS->>CS: active = next
    CS->>RA: onChange(next, previous)
    RA->>H: setAllowedHosts
    RA->>Buf: setMaxEntries (drops the oldest if smaller)
    RA->>Log: setLevel
    RA->>Ch: apply(next, previous)
    Ch->>Ch: changedSections: playwright → reconfigure + restart (not awaited)
    CS->>CS: tcp.port differs from running → restartRequired, log "on the next start"
    CS-->>R: config in use, restartRequired: ["tcp.port"]
    R-->>C: 200
```
