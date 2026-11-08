# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A bridge that runs on a Windows VM next to JAWS/NVDA. A third-party SAPI 5 voice
(`text-to-socket-engine`) sends the screen reader's speech to a TCP port (default 4449); the bridge
records it and exposes it over an HTTP API + SSE (default 5151) for automated tests and AI agents.
The docs in `docs/` describe the full planned design (UI, client, Playwright/MCP supervisors, native
input); much of it is **not implemented yet**. Check `docs/ROADMAP.md` for what exists — currently
only `packages/bridge`, `packages/shared` and `tools/fake-speech` are real (M1 capture core).

## Commands

pnpm monorepo, Node >= 22.12 (CI uses `.nvmrc`).

```bash
pnpm install
pnpm dev                 # bridge in watch mode (tsx watch src/adapters/in/cli/cli.ts)
pnpm test                # all Vitest projects (packages/*/vitest.config.ts, tools/*/vitest.config.ts)
pnpm test packages/bridge/src/domain/config.test.ts   # single test file (no `--`: that runs everything)
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
`main` only changes through PRs.

## Architecture

### Bridge: hexagonal, enforced by ESLint

`packages/bridge/src/`:

- `domain/` — pure model (speech entries, buffer, config, text matching, errors). No I/O, imports
  nothing from outer layers.
- `application/ports/in/` (use cases), `application/ports/out/` (driven ports: repository, event
  bus, clock, config store, logger, capture status), `application/services/` (use-case
  implementations depending only on domain + ports).
- `adapters/in/` (tcp, http, cli, net) and `adapters/out/` (memory, fs-config, log, clock).
- `main.ts` — the composition root and the **only** place that knows concrete adapters and
  services.

`no-restricted-imports` in `eslint.config.js` enforces: domain/application must not import `node:*`
or adapters; adapters must not import concrete services; `in` adapters must not import `out`
adapters and vice versa. Test files (`*.test.ts`) are exempt. When adding a feature, add a port and
wire it in `main.ts` rather than reaching across layers.

Relative imports use `.js` extensions (ESM), and type-only imports must use `import type`
(`consistent-type-imports` is an error).

### Shared contract

`packages/shared` holds only the HTTP API DTOs (exported from `src/index.ts`, consumed as TS
source). It is private and bundled into published packages by tsdown — never published on its own.
Each hexagon owns its own domain model and maps to/from DTOs in its HTTP adapter
(`adapters/in/http/dto.ts`). The OpenAPI spec lives at `packages/bridge/docs/openapi.yaml`.

### Config

Config precedence: CLI flags / `SR_SPEECH_*` env vars (parsed in `adapters/in/cli/options.ts`) win
over the config file (`adapters/out/fs-config`). `PUT /config` validates a patch, persists it and
live re-applies only the changed sections (see `changedSections` / `mergeConfig` in
`domain/config.ts` and the wiring in `main.ts`). Overridden fields are reported back to clients.

### Tests

- Unit tests sit next to the source (`src/**/*.test.ts`) and use in-memory fakes of driven ports
  (`packages/bridge/test/fakes.ts`).
- Integration tests in `packages/bridge/test/` start a real bridge (real TCP + HTTP sockets,
  temp config dir) via helpers in `test/helpers.ts`.

## Docs conventions

Each fact has one home in `docs/`; other docs link to it in one line. The README only introduces the
project and links into `docs/`. Update `docs/ROADMAP.md` checkboxes when a milestone item lands, and
keep `docs/http-api.md` / `openapi.yaml` in sync with HTTP changes.
