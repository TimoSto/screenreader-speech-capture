# Roadmap

Where the project stands, what comes next, and what is still undecided. Small tasks are tracked as
GitHub issues. This file only tracks milestones.

**Legend:** ✅ done (decided, verified or usable today) · 🚧 in progress · ⬜ todo

## Milestones

### M0 Design ✅

- [x] Identify the SAPI socket voice and document its wire format (`text-to-socket-engine`)
- [x] Design docs: architecture, API, client, native input, UI, operations

### M1 Capture core ✅

- [x] pnpm monorepo, TypeScript, ESLint + Prettier, Vitest, `packages/shared` API contract
- [x] Minimal Linux CI: jobs `lint` (lint, format, typecheck), `test`, all on Node 25 (`.nvmrc`), `build`
- [x] TCP listener: framing, `voice=<id>` header, decoding with the configured code page
- [x] In-memory buffer (capped), `seq`, `truncated`
- [x] HTTP API v1: speech, wait, markers, status, SSE stream, `GET /config`
- [x] HTTP API v1: `PUT /config` with the config file and live re-apply
- [x] One error format, `bridge.version` / `apiVersion` in status
- [x] Lifecycle: startup order, graceful shutdown, bridge log, CLI flags and env vars
- [x] `fake-speech` tool for development

### M2 Client ✅

- [x] Library: cursor, `waitForOutput` / `waitForSequence` / `waitForSilence` / `record`, `normalize`
- [x] Version check against the bridge
- [x] CLI with `--json` and exit codes
- [x] Live feed: `onSpeech` (SSE) and CLI `tail`
- [x] Stored bridge URL per user (`config set url`), used by CLI, library and fixture

### M3 Playwright & MCP 🚧

- [x] Supervisor for the Playwright server with selectable version, process-tree kill, restart backoff
- [x] Supervisor for Playwright MCP (`--allowed-hosts`, `--isolated`, auto-installed Chromium),
      `mcp` in status (API 1.2)
- [x] Sessions API: `POST /sessions`, `POST /sessions/end`, `GET /sessions`, `sessionId` on
      entries, `session` filter on speech / wait / stream, SSE `session` event, `session` in status
      (API 1.3)
- [x] Client + CLI sessions: `startSession` / `endSession` / `sessions`, `onSession`, CLI
      `session start|end|list`, CLI reads scoped to the current session
- [ ] Playwright fixture (`connectOptions`, `headless: false`, one session per test instead of
      clearing, transcript attachment) as the client's `./playwright` subpath export
      (`@playwright/test` an optional peer dependency, external in the bundle)

### M4 Native input ⬜

- [ ] `POST /api/v1/set-focus`, `POST /api/v1/input/keys` on `@jitsi/robotjs`, as an optional
      dependency with a disabled fallback, so Linux CI and `pnpm dev` keep working
      ([input injector](architecture.md#native-input-in-the-bridge))
- [ ] Setting `input.enabled` / `--no-input` and status `input: { enabled, reason }`, error code
      `INPUT_DISABLED`
- [ ] Key-name parsing incl. `Insert` / `CapsLock` as held modifiers
- [ ] Client `NativeInput` in-port in screen coordinates
      ([client ports](architecture.md#native-input-in-the-client)), `setFocus(page)` (coordinate
      calculation), `click`, `pressKeys`. CLI `focus`, `press`

### M5 Web UI ⬜

- [ ] Bridge serves the built UI ([static files](architecture.md#serving-the-ui))
- [ ] ESLint hexagon rules for `packages/ui` (components must not call `fetch`)
- [ ] Layout, status bar and status panel (polls `GET /status`, or an SSE `status` event instead
      of polling)
- [ ] Context pane: sessions (grouped by run, follow current, new / end session)
- [ ] Live log per session (follow, filter, markers, export, wipe)
- [ ] Actions panel: keys, presets, click, delayed send (needs M4)
- [ ] Settings (validation, services)
- [ ] Setup page with check button
- [ ] Accessibility of the UI itself (no feedback loop)

### M6 Agents ⬜

- [ ] Agent skill (`SKILL.md`) + `install-skill` command
- [ ] Subagent definitions (for example `a11y-screenreader-tester`)

### M7 Distribution 🚧

- [ ] CI: Windows runner (Linux CI exists since M1)
- [x] Releases from PR titles (independent versions, tags as the source of truth), manual npm
      publish from CI (stable from main, previews from branches)
- [ ] Smoke test on a real VM (NVDA + socket voice + Chrome). It also verifies
      [VM setup](vm-setup.md), which is not yet checked on a real VM

### M8 Own SAPI voice (Rust) ⬜

Replaces the third-party C++ [`text-to-socket-engine`](vm-setup.md#socket-voice-setup) with our
own SAPI 5 voice written in Rust.

- [ ] SAPI 5 TTS engine as a COM DLL (`ISpTTSEngine`, `ISpObjectWithToken`), 32-bit and 64-bit
      builds
- [ ] Same wire format as `text-to-socket-engine` (header line, CRLF lines), so the bridge's
      `text-to-socket` parser works unchanged
- [ ] Host and port configurable per voice (default 4449), matching the bridge's `tcp.port`
- [ ] German voice (language `407`) next to the English one (`409`), so screen readers set to
      German offer it
- [ ] Register / unregister and add / remove voice commands (administrator prompt)
- [ ] If the bridge supervises a voice helper: child services as a keyed map instead of one field
      per service (`ChildService.section`, `StatusServiceDeps`, status DTO)
- [ ] Windows CI build of both DLLs, shipped with the bridge; update
      [vm-setup.md](vm-setup.md#socket-voice-setup)

### Later

- [ ] Optional shared-secret auth token
- [ ] Optional persistent storage (for example SQLite), so sessions survive a bridge restart
- [ ] Maybe: detect the VM's ANSI code page from the registry (`tcp.encoding=auto`), so VMs with
  another code page or the "Use Unicode UTF-8" setting work without `--tcp-encoding`

## Open questions

- **License:** which one (MIT would match `text-to-socket-engine`)?
- **Delayed send:** does the UI's delayed send live in the UI, or in the API (`delayMs` on
  `/input/keys`, so a person can switch to the browser window first, also from the CLI)?
- **Screen reader key:** do `Insert` and `CapsLock` work as held modifiers through robotjs, so NVDA
  and JAWS see `Insert+T`? Check on a real VM early in M4.
- **Default versions:** `DEFAULT_PLAYWRIGHT_VERSION` (1.65.0) and the `@playwright/mcp`
  dependency (0.0.85) are both pinned. Still open: how often to update them.
- **Windows job object:** tie the child services to the bridge's process, so a hard kill of the
  bridge ends them too (see [Shutdown](operations.md#shutdown)).
- **JAWS in CI:** license the VM, or reset a snapshot before each run (demo mode stops after 40 minutes)?
- **Own voice encoding:** should the Rust voice (M8) send UTF-8 instead of the ANSI code page, so
  `tcp.encoding` no longer depends on the VM? That needs a new `tcp.format` or a header flag.
- **NVDA bitness:** newer NVDA versions may run as 64-bit. Check that the 64-bit voice registration
  covers it.
