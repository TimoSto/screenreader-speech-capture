# Development

How to build, run and test the project without (and with) a Windows VM.

```bash
pnpm install
pnpm dev          # bridge (watch)
pnpm dev:ui       # the web UI's Vite dev server; its BFF calls the bridge at http://127.0.0.1:5151 (SR_BRIDGE_API_URL)
pnpm test         # unit + integration tests
pnpm build        # builds the UI first, then the bridge (which copies the UI build into `dist/ui`) and the client; the client build also writes its .d.ts and fails if publint/attw find a broken package
pnpm openapi      # regenerates docs/usage/openapi.yaml from packages/shared (schemas + openapi/spec.ts)
```

To develop the UI against a bridge on the VM, copy `packages/ui/.env.example` to `packages/ui/.env.local`
(gitignored) and set `SR_BRIDGE_API_URL=http://<vm-ip>:5151`. Only `pnpm dev:ui` reads it, and a variable
set in the shell wins. The BFF's server-side calls go through the bridge's [Host check](../usage/security.md#host-and-origin),
so use the VM's IP address or its own host name; any other name needs `--allowed-hosts` on the bridge.

You don't need Windows or a screen reader for most of the work. A fake speech sender stands in for the
SAPI voice:

```bash
pnpm fake-speech --port 4449      # behaves like text-to-socket-engine (header line, CRLF lines)
# or by hand:
printf 'voice=dev\r\nSubmit, button\r\nEdit, Name, blank\r\n' | nc 127.0.0.1 4449
```

Where `@jitsi/robotjs` can't be loaded, the bridge starts with a `DisabledInputInjector`: the input
endpoints answer `409 INPUT_DISABLED`, everything else works. Tests inject a recording
`InputInjector` (`RecordingInputInjector` in `packages/bridge/test/fakes.ts`).

**Writing docs:** each fact has one home. Other docs mention it in one line and link there
(troubleshooting and limitations are such collections of links). The README only introduces the
project and links into `docs/`.

**Testing strategy**

- **Domain / application:** unit tests against in-memory fakes of the driven ports (fake clock,
  the real `SpeechLog`, fake input injector), with no sockets or processes involved.
- **Bridge integration:** `packages/bridge/test/*.test.ts` start a real bridge (real TCP and HTTP
  sockets, temporary config dir) through `test/helpers.ts`. `startBridge` takes `TestSeams`
  (`composition/test-seams.ts`): fake clock, recording input injector and window system, short SSE
  ping, a temp Playwright dir. Test bridges run with Playwright and MCP off (`testOverrides`); the
  service tests pass `playwrightLaunch` / `mcpLaunch` to run `test/fixtures/fake-service.mjs`
  instead, so nothing is installed. The robotjs adapter is tested with a fake robotjs module here,
  and with the real one only on Windows.
- **Contract:** `adapters/in/http/dto/contract.test.ts` checks every DTO mapper's output against
  the schemas in `shared`; `shared/src/openapi/openapi.test.ts` fails when `openapi.yaml` drifts.
- **Client:** unit tests use `packages/client/test/fakes.ts` (a fake bridge and a virtual clock), so
  the cursor, waits, reconnects and timeouts run without sockets or real time.
  `test/bridge.test.ts` runs the library against a real bridge through the bridge's test helpers,
  and every CLI `--json` output is checked against its schema (`test/cli-output.ts`). The
  coordinate maths (`clickPoint`, `contentCornerPoint`) is unit-tested.
- **UI** *(partly done, [M5](../ROADMAP.md#m5-web-ui-))*: `lib/core` logic is unit-tested in node (`*.test.ts`). Components are tested in real Chromium with Vitest browser mode and `vitest-browser-svelte` (`*.svelte.test.ts` next to each component, in its own folder), because they use `@material/web` custom elements that jsdom does not run faithfully. They get plain props, no store or adapter. Install the browser once with `pnpm --filter @screenreader-speech-capture/ui exec playwright install chromium`. The bridge's `test/web-ui.test.ts` checks that the built UI is mounted. End-to-end tests of the UI against a bridge
  fed by `fake-speech` *(planned)*.
- **Smoke test on a real VM:** NVDA + socket voice + Chrome, checking one focus announcement and one
  native screen reader command (`Insert+T`).

## Recipes

Checklists for the common changes. Each step links to where its rule lives.

**A new endpoint, or a new field** (for example `GET /markers/latest`, #217):

1. `packages/shared`: the DTO as a valibot schema (`XSchema`, list it in `schemas.ts`), limits in
   `limits.ts`, the path and its prose in `openapi/spec.ts`; bump the minor `API_VERSION`
   (`api-version.ts`). Run `pnpm openapi` ([contract](decisions.md#the-api-contract-is-valibot-schemas)).
2. Bridge, inside out: the rule in `domain/` (often `SpeechLog`), the method on an in-port in
   `application/ports/in/`, its service, then the route in `adapters/in/http/routes/` and the
   mapper in `adapters/in/http/dto/` (covered by `contract.test.ts`). Expected failures throw an
   `AppError` ([Errors](architecture.md#errors)). A new driven dependency is a new out-port, wired in
   `main.ts` / `composition/`.
3. Client: `BridgeApi` (port) and `FetchBridgeApi` (checks the answer with the schema), the
   service, the in-port (`SpeechCapture` or `NativeInput`), `SpeechCaptureClient` in `main.ts`
   (forwarding by hand) and `index.ts` for new public types.
4. Docs: the row in [HTTP API](../usage/http-api.md#endpoints) with "since API 1.x", the client's
   [functions table](../usage/client.md#functions), and a flow if the sequence is new.

**A new CLI command or option:** the command in `adapters/in/cli/commands/` (registered in
`commands/index.ts`), its help lines, and a valibot schema for its `--json` output in `output.ts`
(`out(command, json, text)` accepts only what it describes; `--help --json` derives from it). Test the
output with `test/cli-output.ts`, then the [Commands](../usage/client.md#commands) section.

**A new bridge setting:** the field in `ConfigPatchSchema` (`shared/src/config.ts`), the type and
default in `bridge/src/domain/config/`, a row in `SETTINGS` (`adapters/in/cli/options.ts`; the
environment variable is derived from the flag), then
[Configuration](../usage/configuration.md). It takes effect on the next start
([decision](decisions.md#settings-apply-on-the-next-start)).

## Debugging

- **Run one test:** `pnpm test packages/bridge/src/domain/speech-log.test.ts` (no `--`, which would
  run everything), or `pnpm test -t "name of the test"`.
- **See what the bridge does:** `SR_SPEECH_LOG_LEVEL=debug pnpm dev` logs every HTTP request and
  every received line (the lines only to the log file; `SR_SPEECH_CONSOLE_SPEECH=1` puts them on the
  console too). The log file is `screenreader-speech-capture/logs/bridge.log` under `%LOCALAPPDATA%`
  (Windows) or `$XDG_STATE_HOME` / `~/.local/state` ([Logging](../usage/operations.md#logging)).
- **Feed speech by hand:** `pnpm fake-speech --port 4449`, or `nc` as above; watch it with
  `npx screenreader-speech-capture-client tail` or `curl -N localhost:5151/api/v1/speech/stream`.
- **UI component tests fail to resolve `tslib`:** a stale Vite cache; delete
  `packages/ui/node_modules/.vite`.
- **Against the VM:** run the bridge on the VM, point the client or `pnpm dev:ui` at it
  (`SR_SPEECH_URL`, `SR_BRIDGE_API_URL`), and keep the console of the VM visible: native input needs an
  unlocked desktop ([VM setup](../usage/vm-setup.md#running-on-the-vm)).

## CI & releases

- **CI** runs on every PR (`main` is protected and only changes through PRs):
  - Linux: lint, type check, unit and integration tests, UI build, client tests against a bridge
    fed by `fake-speech`,
  - Windows runner *(planned, [M7](../ROADMAP.md#m7-distribution-))*: the Windows-only adapter (robotjs input) and a
    bridge start with the Playwright server.
- The **smoke test on a real VM** (NVDA + socket voice + Chrome) runs by hand before a release
  until there is a VM that CI can use.
- **Releases** are published by hand with the `Publish` workflow (see [Releases](#releases)).

## Releases

The bridge (`screenreader-speech-capture`) and the client (`screenreader-speech-capture-client`)
are **versioned independently** (see [Versioning](../usage/http-api.md#versioning)). Their versions come
from the commit titles. PRs are squash-merged, so the commit title is the **PR title**.

**PR titles** follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope[,scope…])[!]: description`. The `PR title` check fails on any other format.

| Title | Effect on each package in the scope |
| --- | --- |
| `feat(bridge): …` | minor |
| `fix(client): …`, `perf(…): …` | patch |
| `<any type>(…)!: …` | major (breaking change), also from 0.x: the first `!` releases `1.0.0` |
| `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `revert` | no release |

- Scopes: `bridge` and `client` select the packages. `shared`, `fake-speech`, `release`, `ui` and `deps`
  are allowed but release nothing. `fix(bridge,client): …` releases both.
- A releasing title (`feat`, `fix`, `perf` or `!`) must name at least one package. A change in
  `packages/shared` names the packages it affects, since `shared` is bundled into both.
- The check fails if a named package has no changes (in its directory or in `packages/shared`).
  It warns if a package's `src` changed but the title doesn't name it.

**Versions** live only in git tags (`<npm name>@<version>`, e.g. `screenreader-speech-capture@0.1.0`).
Every package.json says `0.0.0-dev`. The `Determine versions` job runs in CI on every push and
shows in its summary what publishing that branch would release.

**Publishing** is manual and has two steps:

1. **Stage:** run **Actions → Publish → Run workflow**, pick the branch and the **package**
   (`both` by default, or only `bridge` / `client`). CI builds the packages and **stages** them on
   npm (`npm stage publish`, trusted publishing, no token). Anyone with write access can do this.
   Nothing is installable yet.
2. **Approve:** the maintainer approves each staged package with 2FA, on npmjs.com (package →
   **Staged Packages** → **Approve**) or with `npm stage list <package>` and
   `npm stage approve <stage-id>`. CI can't do this step, so nobody else can release.
   `npm stage reject <stage-id>` discards a staged package.

What the Publish workflow stages:

- **From `main`: stable versions.** For each package, it takes the highest tag and the commit titles
  since then that name the package. The highest bump wins, and no releasing title means nothing to
  publish. The first stable version after a preview tag is its base (`0.0.1-preview.5` + fix →
  `0.0.1`, + feat → `0.1.0`). It stages with npm dist-tag `latest`, pushes the tag (which reserves
  the version) and creates a **draft** GitHub release. After approving on npm, run **Actions →
  Finalize releases**: it publishes every draft release whose version is live on npm. If you
  reject a staged version, delete its draft and tag (`gh release delete <tag> --cleanup-tag`) so
  the next publish reuses the version.
- **From any other branch: previews** of every package whose directory or `packages/shared`
  changed since the merge base with `main`. The version is the next version (from the commit titles
  on the branch, or a patch if none releases anything) plus `-<branch>.<run number>`, e.g.
  `0.1.0-feat-markers-x.42` for branch `feat/Markers_X`. It stages with npm dist-tag
  `preview-<branch>` and creates no tag and no GitHub release. Once approved, the newest preview of
  a branch installs with `pnpm add -D screenreader-speech-capture-client@preview-feat-markers-x`.

Each step skips work that is already done, so **Re-run failed jobs** finishes a publish that
failed halfway.

The **GitHub releases are the changelog**: one per package and stable version, with the commit
titles grouped into breaking changes, features and fixes. There is no `CHANGELOG.md`. Run
`pnpm release:determine-version` for a local dry run (it needs the tags), and
`PR_TITLE='feat(bridge): …' pnpm release:check-title` to check a title.

**One-time setup:** on npmjs.com, for each package, open **Settings → Trusted Publisher → GitHub
Actions** and enter the repository and workflow `publish.yml`, without an environment. Allow only
staged publishing (`npm stage`). Leave "Allow npm-publish" and "Allow npm-dist-tag" unchecked, so
the workflow can't publish directly.
