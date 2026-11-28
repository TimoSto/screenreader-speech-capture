# Web UI flows

Sequence diagrams of how the SvelteKit BFF is mounted in the bridge and how a page request reaches
the API. The design is in [the web UI](../architecture.md#the-web-ui-a-sveltekit-bff).

**Contents**

1. [Mounting the UI at startup](#mounting-the-ui-at-startup)
2. [A page request](#a-page-request)
3. [The setup check](#the-setup-check)

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

The bridge's UI mount (`composition/ui.ts`) redirects `/` to `/ui/` and marks a request from the
bridge's own machine with `x-sr-bridge-local: 1` (stripped from every other request), so the UI can
[hide its log from the local screen reader](../decisions.md#a-ui-opened-on-the-bridges-machine-hides-its-log-from-the-screen-reader).
`hooks.server.ts` builds a `BridgeApi` per request.

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as HttpServer<br/>(adapters/in/http)
    participant M as UI mount<br/>(composition/ui.ts)
    participant UI as SvelteKit handler<br/>(BFF, hooks.server.ts)
    participant API as HttpServer<br/>/api/v1 (same process)

    B->>H: GET /
    H->>H: checkAccess (Host, origin)
    H->>M: not /api/v1, no proxy path
    M-->>B: 302 Location: /ui/
    B->>H: GET /ui/
    H->>H: checkAccess
    H->>M: not /api/v1, no proxy path
    M->>M: set x-sr-bridge-local: 1 if the peer is this machine, else remove it
    M->>UI: handler(req, res)
    UI->>UI: handle: locals.local, locals.bridge (BridgeApi on event.fetch)
    UI->>API: GET http://127.0.0.1:port/api/v1/status (lib/server/bridge-api.ts)
    API-->>UI: StatusDto
    UI->>UI: checkDto(StatusSchema) (mismatch → 502)
    UI-->>B: HTML (server-rendered)
```

## The setup check

**Send Insert+T** on the Setup page ([what it does](../../usage/web-ui.md#speech-test)). **Listen** is
the same without the marker and the keys. The pieces are in
[the web UI](../architecture.md#the-web-ui-a-sveltekit-bff).

```mermaid
sequenceDiagram
    participant S as voice check store<br/>(browser)
    participant UI as BFF routes<br/>(/ui/api)
    participant API as Bridge API<br/>/api/v1

    S->>UI: GET status
    UI->>API: GET /status
    API-->>S: buffer.lastSeq (via the BFF)
    S->>UI: GET speech/stream?since=lastSeq (EventSource)
    UI->>API: GET /speech/stream
    S->>UI: POST markers { label: "ui: Insert+T" }
    UI->>API: POST /markers
    S->>UI: POST input/keys { keys: "Insert+T" }
    UI->>API: POST /input/keys
    API-->>S: marker, then speech entries (stream)
    S->>S: speech after the marker: heard, collect until 1 s quiet
    Note over S: nothing within 5 s: silent
    S->>UI: close the stream
```

