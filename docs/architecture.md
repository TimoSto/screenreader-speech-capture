# Architecture

How the code is organised, and why it is written in Node.js.

## Why Node.js (and not Go)

The bridge is written in **TypeScript on Node.js**:

1. **Playwright server and Playwright MCP are Node programs.** Whatever language the bridge is in,
   Node has to be on the VM. The bridge runs them as supervised child processes and can install
   and start exactly the Playwright version a client needs (`npx playwright@<version> run-server`).
2. **One language end to end.** The bridge, the shared API contract, the client and the SvelteKit
   UI are all TypeScript in one pnpm monorepo.
3. **Simple distribution.** `npm i -g screenreader-speech-capture` works on any machine that
   already has Node for Playwright.

Go's main strength here would be a single static binary. That counts for less when Node has to be
installed anyway.

## Monorepo

pnpm monorepo:

```
packages/
  bridge/   Node/TS process: TCP listener, HTTP API, native input, process supervisor (hexagonal)
  ui/       SvelteKit app (adapter-static), served by the bridge (hexagonal-lite)
  client/   npm lib + CLI (`screenreader-speech-capture-client`) + Playwright fixture
            + agent skill, for tests and agents
  shared/   HTTP API contract (DTO types), used by bridge, UI and client
```

Published packages: `screenreader-speech-capture` (the bridge, with the UI bundled in) and
`screenreader-speech-capture-client`. `shared` is bundled into both and isn't published on its own.
The client never imports from the bridge, so test projects don't pull in the bridge's dependencies
(such as robotjs).

## Bridge: hexagonal (ports & adapters)

```mermaid
flowchart LR
    subgraph IN["Driving adapters"]
        TCP["in/tcp<br/>socket listener + parser"]
        HTTP["in/http<br/>REST + SSE"]
        CLI["in/cli<br/>flags / env"]
    end

    subgraph CORE["Application core"]
        APP["application<br/>use cases + ports"]
        DOM["domain<br/>SpeechEntry, Marker, Config, KeyChord"]
        APP --> DOM
    end

    subgraph OUT["Driven adapters"]
        MEM["out/memory<br/>repository, event bus"]
        CFG["out/fs-config<br/>config.json"]
        SUP["out/playwright, out/mcp<br/>process supervisors"]
        ROBOT["out/robotjs<br/>InputInjector"]
        LOG["out/log<br/>bridge log"]
        CLK["out/clock"]
    end

    Voice["socket voice"] --> TCP
    Client["HTTP clients / UI"] --> HTTP
    User["command line"] --> CLI

    TCP --> APP
    HTTP --> APP
    CLI --> APP

    MEM -. implements port .-> APP
    LOG -. implements port .-> APP
    CFG -. implements port .-> APP
    SUP -. implements port .-> APP
    ROBOT -. implements port .-> APP
    CLK -. implements port .-> APP
```

```
packages/bridge/src/
  domain/            SpeechEntry, Marker, Config, KeyChord (key-name parsing + validation). Pure, no I/O.
  application/
    ports/in/        driving ports (use cases): RecordSpeech, QuerySpeech,
                     WaitForSpeech, ClearSpeech, AddMarker, SendNativeInput,
                     ManageConfig, ManageServices, GetStatus
    ports/out/       driven ports: SpeechRepository, SpeechEventBus, CaptureStatusSource,
                     ConfigStore, ProcessSupervisor, InputInjector, Logger, Clock
    services/        use-case implementations (only depend on domain + ports)
  adapters/
    in/tcp/          socket listener + wire-format parsers → RecordSpeech;
                     tracks its connections (CaptureStatusSource)
    in/http/         REST + SSE routes → driving ports; serves the built UI
    in/net/          listen helper shared by the TCP and HTTP listeners
    in/cli/          flags / env → startup overrides (win over the config file)
    out/memory/      speech repository (capped list), in-process event bus
    out/fs-config/   config.json in %APPDATA%
    out/playwright/  supervisor for the Playwright server (installs the configured version)
    out/mcp/         supervisor for Playwright MCP
    out/robotjs/     InputInjector on @jitsi/robotjs (mouse click, key chords)
    out/log/         bridge log: console + file, prefixes, colours, rotation
    out/clock/       system clock
  main.ts            composition root: the only place adapters are wired to ports
```

**Dependency rule:** `adapters → application → domain`. The domain imports nothing, the application
imports only the domain and its own ports, and the adapters implement or call the ports. Only `main.ts`
knows the concrete adapters. Adapters don't import the concrete services or each other (`in` ↔
`out`). ESLint (`no-restricted-imports` in `eslint.config.js`) enforces all of this.

**Extending:**

- A different socket-voice wire format is a new parser in `adapters/in/tcp/`, selected with `tcp.format`.
- Persistent storage (for example SQLite) is a new `SpeechRepository` in `adapters/out/`.
- A different screen reader capture (for example an NVDA add-on instead of SAPI) is a new
  driving adapter calling `RecordSpeech`.
- A different input method (for example direct `SendInput` through FFI, or the hypervisor's
  keyboard API) is a new `InputInjector`.

## Client: hexagonal-lite

The client package is a library first. The CLI and the Playwright fixture are **driving adapters on
top of the library's public API**, so they can't drift from it (see [Test client](client.md)).

```
packages/client/src/
  core/              pure logic, no I/O: bridge URL precedence + validation (later: cursor, matching,
                     version check)
  ports/             driven ports: ClientConfigStore (later: BridgeApi, Clock)
  adapters/
    out/fs-config/   client.json in %APPDATA% / ~/.config, atomic writes
    in/cli/          argv → library calls → stdout + exit code
  resolve-bridge-url.ts, index.ts
                     wiring and public API: the only place that knows the concrete adapters
```

There is no separate use-case layer or `main.ts`: the library's public functions (later the
`SpeechCaptureClient` methods) *are* the use cases, and users wire the client themselves with
`new SpeechCaptureClient(options)`. Default adapters are chosen at the top level of `src/`.

**Dependency rule** (ESLint, as for the bridge): `core` imports no `node:*`, ports or adapters;
`ports` import only `core`; `adapters/in` (CLI, fixture) import only the public API (`src/index.ts`),
never `core`, `ports` or `adapters/out`; `adapters/out` don't import `adapters/in`. Tests are exempt.

## UI: SvelteKit, hexagonal-lite

```
packages/ui/src/
  lib/
    core/        client-side domain + use cases (filter/search log, config draft & validation)
                 and ports: SpeechFeed, ConfigApi, StatusApi
    adapters/    HTTP/SSE implementations of those ports (talk to the bridge API)
    stores/      Svelte state built on the use cases; ports are wired to adapters here
  routes/        pages: Live log, Settings, Setup (NVDA / JAWS docs)
```

Components never call `fetch` directly. They go through the ports, so the UI can be developed and
tested against fake adapters without a running bridge.

`packages/shared` holds only the **API contract** (DTOs). Each hexagon owns its own domain model and
maps to and from the DTOs in its HTTP adapter.
