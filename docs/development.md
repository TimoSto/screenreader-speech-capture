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
- **Releases** use [changesets](https://github.com/changesets/changesets). The bridge
  (`screenreader-speech-capture`) and the client (`screenreader-speech-capture-client`) are in a
  **fixed version group**, so they always have the same version (see
  [Versioning](http-api.md#versioning)). Merging the changesets release PR publishes both to npm
  from CI.
