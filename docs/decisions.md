# Decisions

Choices that shape the project and rarely change, with the reasons behind them. The code layout,
which changes with refactors, is in [Architecture](architecture.md). One entry per decision, newest
last. Once there are several, they can move to one file each in `docs/decisions/`.

## Node.js, not Go

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

## One consumer per VM

A bridge serves **one consumer at a time**: one test run, one agent or one person. The screen
reader reads only the foreground window, and there is only one keyboard and one mouse, so two
consumers on the same VM would disturb each other however the bridge arbitrated between them.

So the bridge has no locks, leases or per-client state:

- There is one current [session](speech-capture.md#sessions). Starting a session ends the previous
  one, whoever started it.
- Tests that use the screen reader run serially (`workers: 1`). Parallel runs use several VMs,
  each with its own bridge ([Limitations](limitations.md#scale-and-parallelism)).
- The Playwright server, Playwright MCP and the web UI share the same screen reader. Use one at a
  time.

## Client waits read the live feed

The client's waits (`waitForOutput`, `waitForSequence`, `waitForSilence`) follow the **SSE live
feed**, the same code path as `onSpeech` (`waitForOutput` and `waitForSequence` read the buffer once
first). They don't poll, and they don't use `GET /speech/wait`:

1. **One model.** Predicates and ordered sequences can't be sent to the bridge, so matching has to
   happen in the client anyway. With the feed, every wait matches there, on the entries the bridge
   delivers without gap or duplicate (replay and subscription in one step).
2. **No polling load or latency.** A wait is one request plus one open stream, not 20 requests a
   second, and sees speech the moment the bridge has it.
3. **`session: 'current'` is fixed when the wait starts.** The client resolves it to an id once,
   like the bridge's own wait does. A session started while the wait runs doesn't take it over.

`GET /speech/wait` stays as a convenience for `curl` and agents without the client; it is not the
reference behaviour for the client.

## Listener addresses change on the next start

`PUT /api/v1/config` saves every setting, but the listeners' addresses (`tcp.*`, `http.host`,
`http.port`) and the log output (`log.file`, `log.consoleSpeech`) only take effect on the next
start; the answer lists them in `restartRequired`. Everything else (buffer size, log level,
`allowedHosts`, Playwright and MCP) still applies at once.

Moving a listener while it runs meant binding the new address before closing the old one, falling
back when that failed, undoing the steps already applied, and ending only the old server's SSE
streams. That is a lot of code and edge cases for something that happens about once when a VM is
set up, where restarting the bridge is just as easy. The settings that still apply live can't
fail, so a config update needs no undo.

