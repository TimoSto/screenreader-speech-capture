# Development

How to build, run and test the project without (and with) a Windows VM.

```bash
pnpm install
pnpm dev          # bridge (watch) + SvelteKit dev server; Vite proxies /api to the bridge
pnpm test         # unit + integration tests
pnpm build        # builds the UI into the bridge package and compiles the bridge
```

You don't need Windows or a screen reader for most of the work. A fake speech sender stands in for the
SAPI voice:

```bash
pnpm fake-speech --port 4449      # behaves like text-to-socket-engine (header line, CRLF lines)
# or by hand:
printf 'voice=dev\r\nSubmit, button\r\nEdit, Name, blank\r\n' | nc 127.0.0.1 4449
```

Outside Windows (or with `--no-input`), the bridge uses a recording fake `InputInjector` that logs
the clicks and keys it would send.

**Writing docs:** each fact has one home. Other docs mention it in one line and link there
(troubleshooting and limitations are such collections of links). The README only introduces the
project and links into `docs/`.

**Testing strategy**

- **Domain / application:** unit tests against in-memory fakes of the driven ports (fake clock,
  in-memory repository, fake input injector), with no sockets or processes involved.
- **Adapters:** integration tests per adapter (real TCP socket, real HTTP server, temporary config dir).
  The robotjs adapter is tested only on Windows.
- **Client:** library and CLI tested against a real bridge fed by `fake-speech`, covering
  the cursor, timeouts and exit codes. `setFocus` coordinate maths is unit-tested.
- **UI:** component tests with fake port implementations. End-to-end tests against a bridge
  fed by `fake-speech`.
- **Smoke test on a real VM:** NVDA + socket voice + Chrome, checking one focus announcement and one
  native screen reader command (`Insert+T`).

## CI & releases

- **CI** runs on every PR (`main` is protected and only changes through PRs):
  - Linux: lint, type check, unit and integration tests, UI build, client tests against a bridge
    fed by `fake-speech`,
  - Windows runner: the Windows-only adapter (robotjs input) and a
    bridge start with the Playwright server.
- The **smoke test on a real VM** (NVDA + socket voice + Chrome) runs by hand before a release
  until there is a VM that CI can use.
- **Releases** are published by hand with the `Publish` workflow (see [Releases](#releases)).

## Releases

The bridge (`screenreader-speech-capture`) and the client (`screenreader-speech-capture-client`)
are **versioned independently** (see [Versioning](http-api.md#versioning)). Their versions come
from the commit titles. PRs are squash-merged, so the commit title is the **PR title**.

**PR titles** follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope[,scope…])[!]: description`. The `PR title` check fails on any other format.

| Title | Effect on each package in the scope |
| --- | --- |
| `feat(bridge): …` | minor |
| `fix(client): …`, `perf(…): …` | patch |
| `<any type>(…)!: …` | breaking: major, but **minor while the version is 0.x** |
| `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `revert` | no release |

- Scopes: `bridge` and `client` select the packages. `shared`, `fake-speech`, `release` and `deps`
  are allowed but release nothing. `fix(bridge,client): …` releases both.
- A releasing title (`feat`, `fix`, `perf` or `!`) must name at least one package. A change in
  `packages/shared` names the packages it affects, since `shared` is bundled into both.
- The check fails if a named package has no changes (in its directory or in `packages/shared`).
  It warns if a package's `src` changed but the title doesn't name it.

**Versions** live only in git tags (`<npm name>@<version>`, e.g. `screenreader-speech-capture@0.1.0`).
Every package.json says `0.0.0-dev`. The `Determine versions` job runs in CI on every push and
shows in its summary what publishing that branch would release.

**Publishing** is manual and has two steps:

1. **Stage:** run **Actions → Publish → Run workflow** and pick the branch. CI builds the packages
   and **stages** them on npm (`npm stage publish`, trusted publishing, no token). Anyone with
   write access can do this. Nothing is installable yet.
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
