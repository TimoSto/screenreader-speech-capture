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

## `seq` keeps rising across restarts

The first entry of a bridge run gets the run's start time in milliseconds as its `seq`, and every
entry after it the next number. A `seq` from an earlier run is then always lower than the new
run's, so a client cursor, `since` or `Last-Event-ID` from before a restart simply reads the new
run from its start.

Before, `seq` started at 1 with every run, which made an old cursor point into the middle of the
new run. Every run had a random `instanceId` (status, speech lists, an SSE `bridge` event), and the
client compared it on every read and feed connection and threw `BridgeRestartedError`. That was a
lot of code in both packages for a rare event in development, where the test that lost its speech
fails anyway. It holds as long as a run records fewer entries than it runs milliseconds, far more
than any screen reader says. Session ids still start at 1; tests start a new session anyway.

## Bridge and client are released together

The client only checks the bridge's **major** API version. It used to also require a minimum minor
version (`MIN_BRIDGE_API`) and planned per-function checks (`requireApiVersion`) for features an
older bridge lacks. Bridge and client are installed from the same release, so those checks
guarded a combination nobody runs, and they made every API addition a compatibility question.
Settings and status fields of features that don't exist yet (`input.enabled`, `--no-input`,
`tcp.format` with its single value) were removed for the same reason: they return with the feature.

## The speech log owns the buffer and session rules

`SpeechLog` in the bridge's domain holds the entries and the sessions together: it gives out `seq`
and session ids, tags each entry with the current session, caps the buffer, tracks what was
dropped (`truncated`, globally and per session), and forgets an ended session once its last entry
is gone. The services only validate input and publish events.

Before, these rules sat in two in-memory repository adapters plus helpers in
`application/shared/`, and four services each kept a part of the session rules in step. The
bridge keeps its speech in memory by design, so the repository ports only hid the rules from the
domain. The log also keeps an index per session and drops the oldest entry in O(1), so
`/status`, the session list and reads after a `seq` don't scan the whole buffer (up to a million
entries).

## Sessions warn instead of locking

One screen reader means one current session, so two clients (two Playwright workers, or a person
starting a session from the CLI during a run) would mix up each other's speech. The bridge
doesn't lock a session to its client: a test run that crashes without ending its session would
leave it locked, and every later start would need a forced takeover. Instead clients name
themselves (`X-SR-Speech-Client`), and the bridge warns when one ends or replaces another one's
session, and returns the replaced session from `POST /sessions`. A lease that expires could
come later if parallel workers become a real use case.


## The SSE replay follows the reader

A stream opened with `Last-Event-ID` replays the buffered entries in pages, pausing whenever the
client hasn't read what was written and every few hundred entries, so speech capture and other
requests run in between. Before, the whole replay was written in one synchronous block: up to the
whole buffer, on the event loop that also receives the speech, and over 1 MiB it closed the
stream, so the client reconnected and the same replay started again.

Live entries that arrive during the replay aren't queued: the replay reads them from the buffer,
then switches to the live events. The subscription comes before the first read, so every entry
is either read by the replay or delivered live afterwards. A `seq` cursor (`SeqCursor`, `seq`
rises strictly) drops an entry the replay already read but the bus delivers late. So nothing is
missed or sent twice with any event bus that keeps the publish order, synchronous or not, and
the memory a replay holds is one page. The price is that a `clear` or `session` event during a replay comes
between replayed entries, and entries dropped meanwhile get a second `truncated` event.

## The bridge is the single way in

The Playwright server and Playwright MCP listen on `127.0.0.1`, and clients reach them through
the bridge's HTTP port, on `/playwright` and `/playwright-mcp`. Before, they listened next to the
API on `http.host` (by default every interface), and MCP had its host check turned off
(`--allowed-hosts *`). The API checks `Host` and `Origin` against DNS rebinding and cross-site
requests from the pages the VM's browser opens, but the far more powerful Playwright server
(remote command execution) had no such check. Now one place applies one set of rules to all three,
the firewall needs only one port, and the planned shared-secret token will have one place to go.

The paths are fixed, not secret. The loopback ports stay reachable from inside the VM, so a page
in the VM's browser could still open a WebSocket to `127.0.0.1:3000` directly. A random path
would hide that port only as long as nothing reveals it; the token is the real answer, and until
then the bridge only claims to protect what goes through it.

## The API contract is valibot schemas

The DTOs in `packages/shared` are [valibot](https://valibot.dev) schemas, and their TS types are
inferred from them. Before, the contract lived in three hand-synced places: the TS types, the
schemas in `docs/openapi.yaml` and the prose in `docs/http-api.md`. Nothing checked them, and they
drifted (a `seq` comment from API 1.6, limits copied into the client).

Now one definition gives:

- the types bridge and client compile against;
- `components.schemas` of `docs/openapi.yaml`, generated with `pnpm openapi` and checked by a test;
- the client's check of every answer (`checkDto`). A body that doesn't match fails at the boundary
  with the field that is wrong (`INVALID_RESPONSE`), not somewhere inside the client. Unknown
  fields pass and are dropped, because minor versions may add them.

valibot because it is small and tree-shakes: it is bundled into bridge and client with `shared`,
so users install nothing extra. The bridge keeps its own request checks (`request.ts`, the config
checks): they give the field-specific `INVALID_REQUEST` messages the API documents. They use the
same limits and patterns from `shared`.
