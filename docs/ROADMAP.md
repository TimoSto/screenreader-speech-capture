# Roadmap

Where the project stands, what comes next, and what is still undecided. Small tasks are tracked as
GitHub issues. This file only tracks milestones.

**Legend:** ✅ done (decided, verified or usable today) · 🚧 in progress · ⬜ todo

## Milestones

### M0 Design ✅

- [x] Identify the SAPI socket voice and document its wire format (`text-to-socket-engine`)
- [x] Design docs: architecture, API, client, native input, UI, operations

### M1 Capture core 🚧

- [x] pnpm monorepo, TypeScript, ESLint + Prettier, Vitest, `packages/shared` API contract
- [x] Minimal Linux CI: jobs `lint` (lint, format, typecheck), `test`, all on Node 25 (`.nvmrc`), `build`
- [ ] TCP listener: framing, `voice=<id>` header, decoding with the configured code page
- [ ] In-memory ring buffer, `seq`, `truncated`
- [ ] HTTP API v1: speech, wait, markers, config, status, SSE stream
- [ ] One error format, `bridge.version` / `apiVersion` in status
- [ ] Lifecycle: startup order, graceful shutdown, bridge log
- [ ] `fake-speech` tool for development

### M2 Client ⬜

- [ ] Library: cursor, `waitForOutput` / `waitForSequence` / `waitForSilence` / `record`, `normalize`
- [ ] Version check against the bridge
- [ ] CLI with `--json` and exit codes (alias `sr-speech`)

### M3 Playwright & MCP ⬜

- [ ] Supervisor for the Playwright server with selectable version, process-tree kill, restart backoff
- [ ] Supervisor for Playwright MCP (`--allowed-hosts`)
- [ ] Playwright fixture (`connectOptions`, `headless: false`, clear before each test, transcript attachment)

### M4 Native input ⬜

- [ ] `POST /api/v1/set-focus`, `POST /api/v1/input/keys` on `@jitsi/robotjs`
- [ ] Key-name parsing incl. `Insert` / `CapsLock` as held modifiers
- [ ] Client `setFocus(page)` (coordinate calculation), `click`, `pressKeys`. CLI `focus`, `press`

### M5 Web UI ⬜

- [ ] Status bar, live log (follow, filter, markers, export)
- [ ] Settings (validation, services)
- [ ] Setup page with check button
- [ ] Accessibility of the UI itself (no feedback loop)

### M6 Agents ⬜

- [ ] Agent skill (`SKILL.md`) + `install-skill` command
- [ ] Subagent definitions (for example `a11y-screenreader-tester`)

### M7 Distribution ⬜

- [ ] CI: Windows runner (Linux CI exists since M1)
- [ ] Changesets with a fixed version group, npm publish from CI
- [ ] Smoke test on a real VM (NVDA + socket voice + Chrome)

### Later

- [ ] Optional shared-secret auth token
- [ ] Optional persistent storage (for example SQLite) / session export
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
| HTTP API | [http-api.md](http-api.md) | ⬜ | M1 |
| Operations | [operations.md](operations.md) | ⬜ | M1 |
| Configuration | [configuration.md](configuration.md) | ⬜ | M1 |
| Test client | [client.md](client.md) | ⬜ | M2, fixture in M3 |
| Remote Playwright & MCP | [playwright-mcp.md](playwright-mcp.md) | ⬜ | M3 |
| Native input | [native-input.md](native-input.md) | ⬜ | M4 |
| Web UI | [web-ui.md](web-ui.md) | ⬜ | M5 |
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
- **Default versions:** which Playwright and Playwright MCP versions the bridge bundles, and how
  often to update them.
- **JAWS in CI:** license the VM, or reset a snapshot before each run (demo mode stops after 40 minutes)?
- **NVDA bitness:** newer NVDA versions may run as 64-bit. Check that the 64-bit voice registration
  covers it.
