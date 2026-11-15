# Web UI flows

Sequence diagrams of how the SvelteKit BFF is mounted in the bridge and how a page request reaches
the API. The design is in [the web UI](../architecture.md#the-web-ui-a-sveltekit-bff).

**Contents**

1. [Mounting the UI at startup](#mounting-the-ui-at-startup)
2. [A page request](#a-page-request)

## Mounting the UI at startup

The handler loads after the HTTP port is known, because SvelteKit reads `SR_BRIDGE_API_URL` when it
loads. Requests that arrive earlier wait. A failed load is logged and leaves the API working
([serving the UI](../architecture.md#serving-the-ui)).

```mermaid
sequenceDiagram
    participant M as main.ts / composition/ui.ts
    participant H as HttpServer
    participant UI as dist/ui/handler.js<br/>(SvelteKit, adapter-node)

    M->>M: createUiMount(dist/ui) (undefined if handler.js is missing)
    M->>H: new HttpServer({ ui: mount.handler })
    M->>H: start(config.http) → port
    M->>M: env SR_BRIDGE_API_URL = http://127.0.0.1:port
    M->>UI: import handler.js
    UI-->>M: handler (requests waiting for it now run)
```

## A page request

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as HttpServer<br/>(adapters/in/http)
    participant UI as SvelteKit handler<br/>(BFF)
    participant API as HttpServer<br/>/api/v1 (same process)

    B->>H: GET /
    H->>H: checkAccess (Host, origin)
    H->>UI: not /api/v1, no proxy path → ui(req, res)
    UI->>API: GET http://127.0.0.1:port/api/v1/status (bridge-api.ts)
    API-->>UI: StatusDto
    UI->>UI: checkDto(StatusSchema) (mismatch → 502)
    UI-->>B: HTML (server-rendered)
```
