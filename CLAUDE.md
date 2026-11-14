# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A bridge that runs on a Windows VM next to JAWS/NVDA. A third-party SAPI 5 voice
(`text-to-socket-engine`) sends the screen reader's speech to a TCP port (default 4449); the bridge
records it and exposes it over an HTTP API + SSE (default 5151) for automated tests and AI agents.
The docs in `docs/` describe the full planned design (UI, client, Playwright/MCP supervisors, native
input); much of it is **not implemented yet**. Check `docs/ROADMAP.md` for what exists — currently
`packages/bridge`, `packages/shared` and `tools/fake-speech` are real (M1 capture core), and
`packages/client` has the M2 library, version check, CLI and SSE live feed (`onSpeech` / `tail`).
The bridge also supervises the Playwright server and Playwright MCP (M3: `adapters/out/process` is
the generic supervisor, `adapters/out/npm` the per-version npm install, `adapters/out/playwright`
installs and runs the configured Playwright version, `adapters/out/mcp` runs the `@playwright/mcp`
dependency).

## Commands

pnpm monorepo, Node >= 22.12 (CI uses `.nvmrc`).

```bash
pnpm install
pnpm dev                 # bridge in watch mode (tsx watch src/bin/cli.ts)
pnpm test                # all Vitest projects (packages/*/vitest.config.ts, tools/*/vitest.config.ts)
pnpm test packages/bridge/src/domain/config/merge.test.ts # single test file (no `--`: that runs everything)
pnpm test -t "name of test"                           # filter by test name
pnpm lint                # eslint . (type-checked rules + architecture import rules)
pnpm format:check        # prettier (singleQuote, printWidth 100, trailingComma all)
pnpm typecheck           # tsc --noEmit in every package
pnpm build               # tsdown bundles the bridge CLI to packages/bridge/dist/cli.mjs
pnpm fake-speech --port 4449   # stands in for the SAPI socket voice; no Windows needed
```

Dependencies are pinned to exact versions. Never use version ranges (`^`, `~`, `>=`, `*`, …) in
any `package.json`; `.npmrc` sets `save-exact=true` so `pnpm add` writes exact versions. Internal
packages use `workspace:*`.

CI (`.github/workflows/ci.yml`) runs on every push: lint + format:check + typecheck, test, build.
`main` only changes through squash-merged PRs. The PR title must be a Conventional Commit title
whose scopes name the released packages (`feat(bridge): …`, `fix(bridge,client)!: …`). It decides
the versions, which live only in git tags (package.json versions stay `0.0.0-dev`). Publishing is
manual via the `Publish` workflow (stable from `main`, previews from other branches). CI only
stages on npm; the maintainer approves with 2FA (rules in `docs/development.md#releases`, code in
`tools/release`).

## Architecture

### Hexagonal packages (bridge, client), enforced by ESLint

`packages/bridge/src/` and `packages/client/src/` share one layout and one rule set (client
details in `docs/architecture.md`). The bridge:

- `domain/` — pure model (`SpeechLog`: the buffer and the sessions with their rules; speech
  entries, config, text matching, errors). No I/O, imports nothing from outer layers.
- `application/ports/in/` (use cases), `application/ports/out/` (driven ports: event bus,
  clock, config store, logger, process supervisor), `application/services/` (use-case
  implementations depending only on domain + ports), `application/shared/` (helpers several
  services use; adapters may not import it).
- `adapters/in/` (tcp, http, cli, net) and `adapters/out/` (memory, fs-config, log, clock).
- The composition root: `main.ts` (a thin `startBridge`) plus `composition/` (config loading,
  logging, building supervisors and proxy routes, re-apply wiring, listener start order). It is
  the **only** place that knows concrete adapters and services, and it holds no rules: what a
  config change does to the child services is `ChildServicesService.apply`, the start/stop state
  machine is `BridgeLifecycleService`.

The client has the same layers: `ManageClientConfig` / `ClientConfigService` / `FsClientConfigStore`,
`SpeechCapture` / `SpeechCaptureService` / `FetchBridgeApi` (waits read `GET /speech` once, then
follow the SSE stream; they and `onSpeech` (`services/live-feed.ts`) share
`services/speech-events.ts`, which reconnects with `Last-Event-ID`; `seq` keeps rising across bridge restarts), the CLI as a
driving adapter, and `main.ts` also exporting the pre-wired public API (`index.ts`
re-exports it).

`no-restricted-imports` in `eslint.config.js` (blocks built with `hexagon(layer)`, for both
packages) enforces: domain/application must not import `node:*`, shared's Node-only
`platform-paths`, adapters or the composition root; adapters must not import concrete services;
`in` adapters must not import `out` adapters and vice versa. Domain/application also may not use
the timer globals, `Date.now()` / `new Date()`, `process`, `fetch` or `performance`
(`innerLayerGlobals`): time and timers come through the `Clock` port. Test files (`*.test.ts`)
are exempt. When adding a feature, add a port and
wire it in the composition root (`main.ts` + `composition/`) rather than reaching across layers.

Relative imports use `.js` extensions (ESM), and type-only imports must use `import type`
(`consistent-type-imports` is an error).

### Shared contract

`packages/shared` holds only the HTTP API contract (exported from `src/index.ts`, consumed as TS
source): the DTOs as **valibot schemas** (`XSchema`, with `XDto = InferOutput<…>`), the protocol
limits and patterns (`limits.ts`: `API_LIMITS`, `CONFIG_LIMITS`), and `checkDto` (`validate.ts`),
which the client uses to check every answer. Plus one contract rule: `text-match.ts` (`normalizeText`, `createTextTest`), used by both
the bridge's wait and the client's waits. A second, Node-only entry
(`@screenreader-speech-capture/shared/platform-paths`, kept out of `index.ts` so the UI can import
the DTOs) holds `appDir`, the per-user config/state/cache folders, so the bridge's `config.json` and
the client's `client.json` agree. It is private and bundled into published packages by tsdown — never published on its own.
Each hexagon owns its own domain model and maps to/from DTOs in its HTTP adapter
(`adapters/in/http/dto/`, one file per resource; `dto/contract.test.ts` checks their output
against the schemas). The OpenAPI spec lives at `docs/openapi.yaml`: its `components.schemas` are
**generated** from the schemas (`pnpm openapi`, list in `shared/src/schemas.ts`), the rest is
hand-written. `shared/src/openapi/openapi.test.ts` fails when the file drifts from the schemas
or from `API_VERSION`. valibot is bundled into bridge and client with `shared` (`deps.onlyBundle`
in each `tsdown.config.ts`).

### Config

Config precedence: CLI flags / `SR_SPEECH_*` env vars (parsed in `adapters/in/cli/options.ts`) win
over the config file (`adapters/out/fs-config`). `PUT /config` validates a patch, persists it and
live re-applies the changed sections (see `changedSections` / `mergeConfig` in `domain/config/`
and `composition/reapply.ts`, which hands child-service changes to `ChildServicesService.apply`),
except the restart-only settings (`RESTART_FIELDS` in
`domain/config/restart.ts`: listener addresses, log output), which it reports as
`restartRequired` until the next start.

### Tests

- Unit tests sit next to the source (`src/**/*.test.ts`) and use in-memory fakes of driven ports
  (`packages/bridge/test/fakes.ts`).
- Test bridges run with `playwright`/`mcp` disabled (`testOverrides`), so nothing is installed.
  Service tests pass `playwrightLaunch` to run `test/fixtures/fake-service.mjs` instead.
- Integration tests in `packages/bridge/test/` start a real bridge (real TCP + HTTP sockets,
  temp config dir) via helpers in `test/helpers.ts`. The client's `test/bridge.test.ts` reuses
  those helpers; its unit tests use `packages/client/test/fakes.ts` (fake bridge + virtual clock).

## Docs conventions

Each fact has one home in `docs/`; other docs link to it in one line. The README only introduces the
project and links into `docs/`. Update `docs/ROADMAP.md` checkboxes when a milestone item lands, and
keep `docs/http-api.md` / `docs/openapi.yaml` in sync with HTTP changes (change a schema in
`packages/shared`, then run `pnpm openapi`; paths and prose in the YAML are edited by hand). The
client CLI's `--json` output is a contract too: one valibot schema per command in
`packages/client/src/adapters/in/cli/output.ts` (`out(command, json, text)` only accepts what it
describes), published as `docs/cli-output.schema.json` with `pnpm cli-schema`. Tests check every
`--json` output against it (`packages/client/test/cli-output.ts`).

Docs may describe features that don't exist yet. Mark them so a reader who lands on a page can tell:
a page that is entirely design gets a `> **Planned (Mx), not implemented yet.**` note under its
title; a single planned endpoint, function, command, setting or section gets
`*(planned, [Mx](ROADMAP.md#…))*`. A plain link to a planned page needs no marker (the page has
one). Remove the markers when the milestone lands. Lasting decisions and their reasons go in
`docs/decisions.md`, not in `architecture.md`.
