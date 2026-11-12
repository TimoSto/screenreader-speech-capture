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
- [ ] Supervisor for Playwright MCP (`--allowed-hosts`)
- [ ] Sessions API: `POST /sessions`, `POST /sessions/end`, `GET /sessions`, `sessionId` on
      entries, `session` filter on speech / wait / stream, SSE `session` event, `session` in status
      (API 1.2)
- [ ] Client + CLI sessions: `startSession` / `endSession` / `sessions`, `onSession`, CLI
      `session start|end|list`, CLI reads scoped to the current session
- [ ] Playwright fixture (`connectOptions`, `headless: false`, one session per test instead of
      clearing, transcript attachment)

### M4 Native input ⬜

- [ ] `POST /api/v1/set-focus`, `POST /api/v1/input/keys` on `@jitsi/robotjs`
- [ ] Key-name parsing incl. `Insert` / `CapsLock` as held modifiers
- [ ] Client `setFocus(page)` (coordinate calculation), `click`, `pressKeys`. CLI `focus`, `press`

### M5 Web UI ⬜

- [ ] Layout, status bar and status panel (polls `GET /status`)
- [ ] Context pane: sessions (grouped by run, follow current, new / end session)
- [ ] Live log per session (follow, filter, markers, export, wipe)
- [ ] Actions panel: keys, presets, click, delayed send (needs M4)
- [ ] Settings (validation, services)
- [ ] Setup page with check button
- [ ] Accessibility of the UI itself (no feedback loop)

### M6 Agents ⬜

- [ ] Agent skill (`SKILL.md`) + `install-skill` command
- [ ] Subagent definitions (for example `a11y-screenreader-tester`)

### M7 Distribution ⬜

- [ ] CI: Windows runner (Linux CI exists since M1)
- [ ] Releases from PR titles (independent versions, tags as the source of truth), manual npm
      publish from CI (stable from main, previews from branches)
- [ ] Smoke test on a real VM (NVDA + socket voice + Chrome)

### Later

- [ ] Optional shared-secret auth token
- [ ] Optional persistent storage (for example SQLite), so sessions survive a bridge restart
- [ ] Maybe: detect the VM's ANSI code page from the registry (`tcp.encoding=auto`), so VMs with
  another code page or the "Use Unicode UTF-8" setting work without `--tcp-encoding`

## State per topic

| Topic | Doc | State | Note |
|---|---|---|---|
| Why Node.js | [architecture.md](architecture.md#why-nodejs-and-not-go) | ✅ | Decided |
| Requirements | [vm-setup.md](vm-setup.md#requirements) | ✅ | Decided |
| Socket voice | [vm-setup.md](vm-setup.md#socket-voice-setup) | ✅ | Third-party, package contents and wire format checked |
| Screen reader setup | [vm-setup.md](vm-setup.md#screen-reader-setup) | ⬜ | Not yet verified on a real VM |
| Running on the VM | [vm-setup.md](vm-setup.md#running-on-the-vm) | ⬜ | Not yet verified on a real VM |
| Speech capture | [speech-capture.md](speech-capture.md) | ⬜ | M1 |
| Sessions | [speech-capture.md](speech-capture.md#sessions) | ⬜ | Designed, M3 (before the fixture) |
| HTTP API | [http-api.md](http-api.md) | 🚧 | M1 done, Playwright service in M3; sessions and MCP come with M3, native input with M4 |
| Operations | [operations.md](operations.md) | 🚧 | Startup, shutdown, bridge log and the Playwright server supervisor done; MCP comes with M3 |
| Configuration | [configuration.md](configuration.md) | 🚧 | Flags, env, config file, `PUT /config` and `playwright.*` done; `mcp` and `input` take effect with M3/M4 |
| Test client | [client.md](client.md) | 🚧 | Library, CLI, version check and live feed done; sessions and fixture in M3, native input in M4 |
| Remote Playwright & MCP | [playwright-mcp.md](playwright-mcp.md) | 🚧 | Playwright server done (install, supervision); MCP next |
| Native input | [native-input.md](native-input.md) | ⬜ | M4 |
| Web UI | [web-ui.md](web-ui.md) | ⬜ | M5. Designed: status, context pane (sessions), live log, actions |
| Agents | [agents.md](agents.md) | ⬜ | M6 |
| Development, CI & releases | [development.md](development.md) | ⬜ | M1 tooling, M7 CI |
| Security | [security.md](security.md) | ✅ | Documented. The auth token is under Later |
| Troubleshooting | [troubleshooting.md](troubleshooting.md) | ✅ | Kept up to date as issues are found |
| Limitations | [limitations.md](limitations.md) | ✅ | Documented |
| Architecture | [architecture.md](architecture.md) | ⬜ | Designed, no code yet |
| License | — | ⬜ | Not chosen yet |

## Open questions

- **License:** which one (MIT would match `text-to-socket-engine`)?
- **Screen reader key:** do `Insert` and `CapsLock` work as held modifiers through robotjs, so NVDA
  and JAWS see `Insert+T`? Check on a real VM early in M4.
- **Default versions:** Playwright is a pinned constant (`DEFAULT_PLAYWRIGHT_VERSION`, 1.65.0).
  Still open: the MCP default, and how often to update both.
- **Windows job object:** tie the child services to the bridge's process, so a hard kill of the
  bridge ends them too (see [Shutdown](operations.md#shutdown)).
- **JAWS in CI:** license the VM, or reset a snapshot before each run (demo mode stops after 40 minutes)?
- **NVDA bitness:** newer NVDA versions may run as 64-bit. Check that the 64-bit voice registration
  covers it.
