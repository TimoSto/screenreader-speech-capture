# Config flows

Sequence diagram of a configuration change through the hexagon: the HTTP adapter and
`ConfigService`. The user-facing rules are in
[Configuration → Changing settings](../../usage/configuration.md#changing-settings).

**Contents**

1. [PUT /config through the layers](#put-config-through-the-layers)

## PUT /config through the layers

Updates run one at a time (a queue in `ConfigService`). The file is saved first, so a write error
changes nothing. The configuration in use never changes while the bridge runs: `ConfigService`
keeps a second one, `saved` (in use plus every update), which the next update starts from and
`PUT` answers with
([Decisions](../decisions.md#settings-apply-on-the-next-start)).

```mermaid
sequenceDiagram
    participant C as Client
    participant R as config-routes<br/>(adapters/in/http)
    participant CS as ConfigService
    participant F as FsConfigStore<br/>(config.json)

    C->>R: PUT /api/v1/config {"buffer": {...}, "tcp": {"port": 4450}}
    R->>CS: update(patch) (queued)
    CS->>CS: validatePatch (invalid → 400, nothing changed)
    CS->>CS: saved = mergeConfig(saved, patch), assertDistinctPorts
    CS->>F: save(file settings + patch)
    CS->>CS: log "tcp.port: 4449 → 4450 on the next start"
    CS-->>R: saved config
    R-->>C: 200
```
