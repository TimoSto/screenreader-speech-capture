# Decisions

Choices that shape the project and rarely change, with the reasons behind them. The code layout,
which changes with refactors, is in [Architecture](architecture.md). One entry per decision, added at
the end. The contents group them by area and name the PR that made each one; later PRs may have
refined it (`git log -S '<heading>' -- docs/implementation/decisions.md`).

**Platform and process**

- [Node.js, not Go](#nodejs-not-go) ([#87](https://github.com/TimoSto/screenreader-speech-capture/pull/87))
- [One consumer per VM](#one-consumer-per-vm) ([#88](https://github.com/TimoSto/screenreader-speech-capture/pull/88))
- [Child process trees are killed by the bridge, not the OS](#child-process-trees-are-killed-by-the-bridge-not-the-os) ([#130](https://github.com/TimoSto/screenreader-speech-capture/pull/130))
- [The bridge is the single way in](#the-bridge-is-the-single-way-in) ([#114](https://github.com/TimoSto/screenreader-speech-capture/pull/114))
- [Settings apply on the next start](#settings-apply-on-the-next-start) ([#139](https://github.com/TimoSto/screenreader-speech-capture/pull/139))

**API and contract**

- [The API contract is valibot schemas](#the-api-contract-is-valibot-schemas) ([#119](https://github.com/TimoSto/screenreader-speech-capture/pull/119))
- [The client checks only the major API version](#the-client-checks-only-the-major-api-version) ([#103](https://github.com/TimoSto/screenreader-speech-capture/pull/103))
- [The client checks the API version on every answer](#the-client-checks-the-api-version-on-every-answer) ([#224](https://github.com/TimoSto/screenreader-speech-capture/pull/224))
- [`seq` keeps rising across restarts](#seq-keeps-rising-across-restarts) ([#101](https://github.com/TimoSto/screenreader-speech-capture/pull/101))
- [Deleting a session is a 400 for the current one, and sends no event](#deleting-a-session-is-a-400-for-the-current-one-and-sends-no-event) ([#174](https://github.com/TimoSto/screenreader-speech-capture/pull/174))
- [Clearing one scope is `DELETE /speech?session=`](#clearing-one-scope-is-delete-speechsession) ([#176](https://github.com/TimoSto/screenreader-speech-capture/pull/176))

**Capture, buffer and live feed**

- [The socket voice stays the only capture source](#the-socket-voice-stays-the-only-capture-source) ([#123](https://github.com/TimoSto/screenreader-speech-capture/pull/123))
- [The speech log owns the buffer and session rules](#the-speech-log-owns-the-buffer-and-session-rules) ([#106](https://github.com/TimoSto/screenreader-speech-capture/pull/106))
- [Sessions warn instead of locking](#sessions-warn-instead-of-locking) ([#112](https://github.com/TimoSto/screenreader-speech-capture/pull/112))
- [The SSE replay follows the reader](#the-sse-replay-follows-the-reader) ([#113](https://github.com/TimoSto/screenreader-speech-capture/pull/113))
- [A stream announces where it starts](#a-stream-announces-where-it-starts) ([#128](https://github.com/TimoSto/screenreader-speech-capture/pull/128))
- [Client waits read the live feed](#client-waits-read-the-live-feed) ([#92](https://github.com/TimoSto/screenreader-speech-capture/pull/92))
- [A wait's regex is not sandboxed](#a-waits-regex-is-not-sandboxed) ([#131](https://github.com/TimoSto/screenreader-speech-capture/pull/131))

**Native input**

- [Captures of native input run on the bridge](#captures-of-native-input-run-on-the-bridge) ([#216](https://github.com/TimoSto/screenreader-speech-capture/pull/216))
- [The bridge focuses browser windows it started](#the-bridge-focuses-browser-windows-it-started) ([#218](https://github.com/TimoSto/screenreader-speech-capture/pull/218))

**Code structure**

- [Services stay where they hold a rule](#services-stay-where-they-hold-a-rule) ([#135](https://github.com/TimoSto/screenreader-speech-capture/pull/135))

**Web UI**

- [The web UI is a SvelteKit BFF inside the bridge process](#the-web-ui-is-a-sveltekit-bff-inside-the-bridge-process) ([#145](https://github.com/TimoSto/screenreader-speech-capture/pull/145))
- [The UI's server build is self-contained](#the-uis-server-build-is-self-contained) ([#168](https://github.com/TimoSto/screenreader-speech-capture/pull/168))
- [The Settings page saves by section and leaves access settings out](#the-settings-page-saves-by-section-and-leaves-access-settings-out) ([#246](https://github.com/TimoSto/screenreader-speech-capture/pull/246))
- [The UI uses SvelteKit's experimental remote functions](#the-ui-uses-sveltekits-experimental-remote-functions) ([#203](https://github.com/TimoSto/screenreader-speech-capture/pull/203))
- [The speech table follows live scopes over SSE and reads ended sessions once](#the-speech-table-follows-live-scopes-over-sse-and-reads-ended-sessions-once) ([#172](https://github.com/TimoSto/screenreader-speech-capture/pull/172))
- [The speech table is a real `<table>`](#the-speech-table-is-a-real-table) ([#172](https://github.com/TimoSto/screenreader-speech-capture/pull/172))
- [The UI builds its own lists instead of using `md-list`](#the-ui-builds-its-own-lists-instead-of-using-md-list) ([#159](https://github.com/TimoSto/screenreader-speech-capture/pull/159))
- [The add-marker action only shows where the marker would land](#the-add-marker-action-only-shows-where-the-marker-would-land) ([#173](https://github.com/TimoSto/screenreader-speech-capture/pull/173))
- [The UI theme lives in the browser, not in the bridge config](#the-ui-theme-lives-in-the-browser-not-in-the-bridge-config) ([#179](https://github.com/TimoSto/screenreader-speech-capture/pull/179))
- [A UI opened on the bridge's machine hides its log from the screen reader](#a-ui-opened-on-the-bridges-machine-hides-its-log-from-the-screen-reader) ([#192](https://github.com/TimoSto/screenreader-speech-capture/pull/192))

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

- There is one current [session](../usage/speech-capture.md#sessions). Starting a session ends the previous
  one, whoever started it.
- Tests that use the screen reader run serially (`workers: 1`). Parallel runs use several VMs,
  each with its own bridge ([Limitations](../usage/limitations.md#scale-and-parallelism)).
- The Playwright server, Playwright MCP and the web UI share the same screen reader. Use one at a
  time.

## The bridge focuses browser windows it started

`POST /input/focus` (API 1.21) brings a window of Playwright MCP's or the Playwright server's
browsers to the front natively, instead of a click computed from the page's geometry
([usage](../usage/native-input.md#bringing-the-browser-to-the-front)). The CLI's `focus` and the
client's `setFocus` / fixture use it first; the click stays as the fallback.

Why: the click guessed the title bar from `outerHeight - innerHeight` and `devicePixelRatio`, which
breaks with other display scaling or a maximised window, and an agent needed three tool calls
(`focus --script` → MCP `browser_evaluate` → `focus --geometry`). The bridge supervises both
services, so their browsers are in process trees it knows.

- **koffi, not PowerShell.** The Win32 calls (`EnumWindows`, `SetForegroundWindow`, …) run in
  process through koffi, an FFI library with prebuilt binaries, in about a millisecond. A
  PowerShell call starts a process and compiles its `Add-Type` block each time (0.5 to 1 s). koffi
  is an optional dependency like robotjs: without it, or not on Windows, the endpoint answers
  `INPUT_DISABLED` and clients fall back to the click.
- **A title marker for tests.** The Playwright server runs a browser per connection and a window
  per context, so "the server's window" is ambiguous. The client puts a unique marker into
  `document.title` and the bridge matches it in the window title. The browser's process id (through
  CDP) would only work for Chromium and still not tell a browser's windows apart.
- **The foreground lock.** Windows lets a background process take the foreground only in some
  cases. The bridge taps Alt first (it is then the last input sender), then tries once more attached
  to the foreground window's input thread. `AllowSetForegroundWindow` doesn't help: it lets another
  process take the foreground. Whether this holds with NVDA and JAWS running is checked on the VM
  ([M7](../ROADMAP.md#m7-distribution-)).

## Captures of native input run on the bridge

`POST /input/keys` and `POST /input/click` take a `capture` (API 1.19); the CLI's `--capture` and
the library's `recordKeys` / `recordClick` use it. The bridge reads the start `seq` inside the input
queue right before the input, follows the speech after it and times the silence from the entries'
`receivedAt` ([usage](../usage/native-input.md#capturing-the-speech-an-input-causes)).

Why: a capture is only correct if "start read" and "input sent" happen in that order with nothing
in between, which only the bridge can guarantee. The client did it with a status read one round
trip before the input (foreign or trailing speech in between counted as the input's), timed the
silence on its own clock (SSE jitter looked like pauses), and needed five requests and a stream.
This doesn't contradict [Client waits read the live feed](#client-waits-read-the-live-feed): that
is about matching with predicates; a capture has none. `record(fn)` stays in the client for actions
the bridge doesn't send (Playwright input). `settleMs` presses after `timeoutMs` even if the speech
didn't pause, so a chatty page can't block the input forever; the trailing speech then shows in the
answer.

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

The CLI's `wait` uses the same path, although it only sends a string or a regex the bridge's wait
could take. The bridge's wait would save no request: a wait asks `GET /status` once to fix its
session (`active` and `current` are resolved when the wait starts, so a session started meanwhile
doesn't take over), and the stream is open long before the
screen reader speaks, so a match isn't reported any sooner. And it would be worse: one long request
of up to 300 s (`timeoutMs` is capped) fails when the link drops, where the feed reconnects with
`Last-Event-ID`; a `since` from an earlier bridge run waits until the timeout instead of getting
`truncated` and the whole buffer; and its `omitted` would have to be mapped onto the CLI's
`truncated`, which means something else.

## Settings apply on the next start

`PUT /api/v1/config` only saves; every setting takes effect on the next start of the bridge, and
`GET` shows the ones in use. Before, the buffer size, log level, `allowedHosts` and the Playwright
and MCP settings applied at once, and the listeners' addresses and log output waited. The live path
needed change listeners, a restart-only list, a `restartRequired` answer, resizing the buffer,
swapping the host list and log level while running, and restarting or stopping child services (an
install can take minutes), about 500 lines with tests and docs.

Moving a listener while it runs meant binding the new address before closing the old one, falling
back when that failed, undoing the steps already applied, and ending only the old server's SSE
streams. That is a lot of code for something that happens about once when a VM is set up, where
restarting the bridge is just as easy. One rule for every setting is also simpler to explain than
a list of exceptions.

The API version went from 1.12 to 1.13 although `restartRequired` was removed, against the rule
that minor versions only add: no client existed yet, so it didn't need `/api/v2`.

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

The start time is the wall clock, so this also assumes the clock doesn't go backwards between a
client's cursor and the next run. That holds in the intended setup: VM snapshots are restored
between tests, never during one, and the client always restarts afterwards, so it has no cursor
from before. A bridge resumed from a memory snapshot keeps its counter and doesn't read the clock
again; one that starts fresh after the restore takes the new time with a fresh client. Only a clock
step backwards during a test, or a long-lived client that keeps its cursor across a bridge restart,
could make a cursor higher than every new `seq` (the log then drops those entries as already
delivered). That is accepted, not handled: persisting the last `seq` would not help after a
restore, because the state folder rolls back with the VM.

## A stream announces where it starts

A live feed opened without `Last-Event-ID` (`onSpeech`, `tail`) used to have no cursor until its
first entry arrived. A connection that dropped before then reconnected without `Last-Event-ID`,
and the bridge, asked for new entries only, replayed nothing: what was said in the gap was lost,
and neither side noticed. Now the bridge's first frame on such a stream is a `position` event
whose `id` is the highest `seq` handed out (`SpeechLog.headSeq`, which also counts dropped and
cleared entries; the buffer's `lastSeq` is `null` when it is empty). The client keeps it like the
`seq` of an entry and reconnects with it. The bridge, not the client, supplies the number: it is the
only one that knows it, it needs no extra request, and every SSE client benefits, `curl` and
`EventSource` included.

The same check closes a hole in the `seq` rule above: a `Last-Event-ID` higher than anything the
bridge handed out (from a run whose clock was ahead) is a gap, not a position to wait for, so the
bridge sends `truncated` and the whole buffer instead of dropping every new entry as already
delivered. `GET /speech/wait` doesn't do that: its `since` keeps its meaning of "after this `seq`".

## The client checks the API version on every answer

Every answer under `/api/v1` carries `X-SR-Speech-Api-Version` (API 1.22), and `FetchBridgeApi`
checks it before it reads the body. Before, the services asked `GET /status` once before their
first request (`VersionGate`). For the library that was one request per process, but every CLI call
is a new process, so every command paid a round trip for the check.

Checking the answer instead of asking first is as safe: the client only calls `/api/v1` paths, and
a bridge of another major version either still serves them compatibly (it serves both prefixes for
a while, [Versioning](../usage/http-api.md#versioning)) or answers 404 there, so no request can do
something else than intended. The header is checked before the body because another major version
may shape it differently. A missing header means a bridge older than 1.22, which speaks major 1.

## The client checks only the major API version

The client only checks the bridge's **major** API version. The packages are versioned and
published independently ([Releases](development.md#releases)), but users install bridge and client
from the same release, so a client never meets an older minor version in practice. It used to also
require a minimum minor version (`MIN_BRIDGE_API`) and planned per-function checks (`requireApiVersion`) for features an
older bridge lacks. Bridge and client are installed from the same release, so those checks
guarded a combination nobody runs, and they made every API addition a compatibility question.
Settings and status fields of features that don't exist yet (`input.enabled`, `--no-input`,
`tcp.format` with its single value) were removed for the same reason: they return with the feature.
Native input (API 1.14) brought back only `INPUT_DISABLED`: the bridge has no switch for input, it is
off exactly when robotjs can't be loaded, and the endpoints say so.

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

## Deleting a session is a 400 for the current one, and sends no event

`DELETE /sessions?session=<id>` refuses the current session and `none` with `INVALID_REQUEST`
(`details.field = session`) instead of a new `CONFLICT` code: it is a bad request for that
parameter, and a new error code would break clients that only know the existing ones. It publishes
no event: the UI polls `GET /sessions`, and a live feed has no deleted-session state to keep.
Entries of the deleted session leave the buffer, so reads without a filter no longer show them.

## Clearing one scope is `DELETE /speech?session=`

The thing removed is the speech, not the session, so the scoped clear is the existing `DELETE
/speech` with the `session` filter every read already takes (without it: the global wipe, as
before). `DELETE /sessions/{id}` would clash with deleting a session, `POST /sessions/{id}/clear`
can't name `none`, and the router has no path parameters. Only the current session and `none` can
be cleared: an ended session is deleted instead (`INVALID_REQUEST`). The `clear` event keeps its
name and carries the scope in its data (`sessionId`, absent for a global clear): feeds of other
scopes don't receive it, an unfiltered feed can drop just that scope's rows, and old clients that
ignore the data still reset, which is safe.

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
schemas in `docs/usage/openapi.yaml` and the prose in `docs/usage/http-api.md`. Nothing checked them, and they
drifted (a `seq` comment from API 1.6, limits copied into the client).

Now one definition gives:

- the types bridge and client compile against;
- `docs/usage/openapi.yaml`, generated entirely with `pnpm openapi` (the schemas from these definitions,
  the endpoints and prose from `packages/shared/src/openapi/spec.ts`) and checked by a test;
- the client's check of every answer (`checkDto`). A body that doesn't match fails at the boundary
  with the field that is wrong (`INVALID_RESPONSE`), not somewhere inside the client. Unknown
  fields pass and are dropped, because minor versions may add them.

valibot because it is small and tree-shakes: it is bundled into bridge and client with `shared`,
so users install nothing extra. The bridge keeps its own request checks (`request.ts`): they give
the field-specific `INVALID_REQUEST` messages the API documents. They use the same limits and
patterns from `shared`.

The client CLI's `--json` output is described the same way (`packages/client/src/adapters/in/cli/output.ts`):
the tests check every `--json` output against it, and `--help --json` turns it into JSON Schema at
runtime with `@valibot/to-json-schema`, which is bundled into the CLI like valibot. So what an agent
reads about an output can't drift from what the command prints.

The config is the exception: the bridge validates `PUT /config` and the config file with the shared
`ConfigPatchSchema` (`mergeConfig`) and adds no rules of its own, so the contract and the
enforcement cannot drift. The error `field` is the schema's dotted path; the message is valibot's.

## The socket voice stays the only capture source

The application's status has a `tcp` section (listener address, `encoding`, connections), and
`StatusService` falls back to `config.tcp` before the listener has started. The architecture
review suggested a source-neutral `capture: { sources: [...] }` model, so another capture source
(for example an NVDA add-on) would only be a new driving adapter.

It stays as it is: the SAPI socket voice is and will remain the only capture source, because it
works the same for JAWS and NVDA without touching either. A source-neutral model would add an
abstraction with one implementation. If a second source ever comes, that change starts here.

## Child process trees are killed by the bridge, not the OS

On Windows, the children of a killed process live on, so the browsers of a crashed Playwright
server would stay behind. A Job Object (`KILL_ON_JOB_CLOSE`) would make the OS end the whole tree
even if the bridge dies, but Node can't create one without a native addon, which the bridge
doesn't ship (it installs nothing native, and the VM has no compiler).

Instead the bridge does it itself: `taskkill /T /F` raced against a 5 s limit, and a synchronous
kill of every tracked tree right before a forced exit (watchdog, second Ctrl+C).

Not covered, on purpose for now: the orphans of a child that already died on its own. `taskkill
/T` can't reach them through the dead parent. A lookup in the process table (PowerShell
`Get-CimInstance Win32_Process`, descendants by parent pid and creation time) would find them, but
it is unverified that they exist: Playwright starts Chromium over a pipe, and Chromium usually
exits when the pipe closes. Check on the VM (kill the run-server with a browser connected, see if
`chrome.exe` stays) before adding it. Also not covered: a bridge killed with no chance to run
code (Task Manager, log off). The next start refuses to use a port such an orphan still holds,
instead of treating the orphan as its own service. A small helper process holding the Job Object
would close that.

## A wait's regex is not sandboxed

A `regex` wait runs on the capture path, so a catastrophic pattern (`(a+)+$`, `.*.*.*.*!`) blocks
the event loop while it runs. The bridge only limits the length and rejects an empty pattern. A
nested-repeat check was tried and dropped: it can't prove a pattern safe (`.*.*.*.*!` passed it),
so it only gave false confidence. A linear-time engine (`re2js`) would fix it, but adds a
dependency and a different syntax to a developer tool whose callers write their own patterns.
A slow pattern is the author's to fix.

## Services stay where they hold a rule

A service that only forwards calls has no reason to exist: `CaptureService` just passed each call
to `CaptureState` and added the time, so `CaptureState` now takes a `() => Date` and is the
`TrackCapture` implementation itself. The other services were reviewed and stay, because each holds
a rule the composition root must not hold: `BridgeLifecycleService` (idempotent stop, shutdown
order, error aggregation), `ChildServicesService` (what a config change does to each child
service), `StatusService`, `SpeechService` (`RecordSpeech`) and the client's `ClientConfigService`
(source precedence). The layer rules in `eslint.config.js` stay as they are.

## The web UI is a SvelteKit BFF inside the bridge process

The UI is a SvelteKit app with `adapter-node`. Its server code (a backend for the frontend) calls the
bridge's public HTTP API over loopback; the browser never calls the API directly. The bridge loads the
built handler in its own process and serves it on the same HTTP port as the API.

1. **One contract.** The BFF is a client of the public API like any other (every answer is checked
   against the schemas in `shared`), so the UI can do nothing a client can't, and `packages/ui` imports
   no bridge code.
2. **One port, one lifecycle.** No CORS, no extra port to configure or open in the firewall, and the UI
   starts and stops with the bridge (`startBridge`).
3. **Shipped in the bridge package.** The build output is copied to `dist/ui` and has no runtime
   dependencies, so `npm i -g screenreader-speech-capture` is the whole install.

Costs: the UI is a server, not static files, so it runs in the bridge's Node process (a crash in a
load function is caught by SvelteKit, not the bridge); and the UI needs the bridge's API to be up,
which is true whenever the bridge runs. Considered and rejected: static files with the browser calling
the API (no place for server-side logic or later authentication), a separate port (more configuration
and a second origin), and a supervised child process (heavier than needed for a handler).

## The UI builds its own lists instead of using `md-list`

`md-list` renders a `<ul>` in its shadow DOM and `md-list-item` an `<li>`, so the accessibility tree
becomes `md-list > ul > md-list-item > li`, which axe rejects and which can't be fixed from outside.
`md-list-item` is also the one interactive element of its row, but the sessions pane needs a select
button and a stop button side by side (an interactive element inside another is invalid). So lists are
plain `ul > li` with `button`s styled with the theme tokens (like the navigation rail); Material Web
stays for icon buttons, dialogs and text fields. Icon buttons carry `aria-label` and a `title`; the
axe check in `SessionsPane.svelte.test.ts` turns off `label-content-name-mismatch`, which flags the
icon ligature text (`add`, `stop`) as a visible label.

## The UI's server build is self-contained

`adapter-node` leaves a package's `dependencies` external, but the bridge ships `dist/ui` without a
`node_modules` (a global install only has the bridge's own dependencies). So `packages/ui/vite.config.ts`
bundles what the server code imports (`ssr.noExternal`), and `packages/bridge/tsdown.config.ts` fails the
build when a bare import is left in `ui/build/server`.

## The speech table follows live scopes over SSE and reads ended sessions once

The bridge's stream (`GET /speech/stream`) only sends *new* entries unless the client reconnects with
`Last-Event-ID`. So a live scope opens the stream through the UI's relay with `since=0`, which the relay
sends upstream as `Last-Event-ID: 0`: the bridge replays the buffer (filtered by `session`) and then
follows, with no race between a history fetch and the stream, and the store's `seq` check absorbs
overlaps. An ended session never gets entries, so it is read once with `GET /speech?session=<id>` in
pages and no connection is held open. The page decides "live" once, when a scope opens: a session that
ends while it is shown keeps its rows and is read as an ended one the next time it is selected.

The relay passes the bridge's response body through untouched instead of parsing and re-framing events,
so the UI can't drift from the bridge's SSE format (`docs/usage/flows/sse.md`).

## The speech table is a real `<table>`

The mockup draws the rows as a `div` grid with an `aria-hidden` column header. A `<table>` with
`<th scope="col">` gives screen reader users (this tool's users) row and column navigation, so the UI uses
one. The time and seq columns are as wide as their text (`seq` is a 13-digit number), and the seq column
is hidden in a narrow log. The sticky header needs `border-collapse: separate`, or its borders scroll away.

## The add-marker action only shows where the marker would land

`POST /api/v1/markers` has no session parameter: the bridge files a marker under the current session,
or outside any session when none is current. So the log offers the action (`canAddMarker`) in the
current session, and in "Outside sessions" while no session is current. In "Outside sessions" while a
session is live, and in an ended session, it is hidden: the marker would appear in a different log than
the one on screen. A button that is there but does something else would be worse than none.

## The UI theme lives in the browser, not in the bridge config

The color theme (light, dark, high contrast, dark high contrast) is a property of the person and the
browser looking at the UI, not of the bridge, and several browsers can open the same bridge. So it is kept
in `localStorage` (`sr-theme`) and the bridge config and API don't know about it. An inline script in
`app.html` applies it before the first paint. `prefers-color-scheme` is ignored on purpose: the UI starts
light, and a high-contrast need is an explicit choice.

## A UI opened on the bridge's machine hides its log from the screen reader

The screen reader reads the machine it runs on, so the UI opened there would speak its own log rows into
the log (`Outside sessions`, `#<seq>` cells). `aria-live="off"` isn't enough: JAWS still reads changes
inside a focused region. The bridge's UI handler sets `x-sr-bridge-local: 1` on a request whose peer
address is loopback or one of the machine's own interface addresses (a page opened on the VM through its LAN IP comes from that IP, not from loopback) and removes the header from every other one (so a client can't send it); the BFF's
`hooks.server.ts` turns it into `locals.local`, and `SpeechLog` then marks its rows `aria-hidden`, drops
the region and `tabindex`, and a warning banner above the log says why. A page opened from another machine is unchanged. A proxy that
connects from the machine itself makes remote viewers look local.

## The Settings page saves by section and leaves access settings out

The Settings page is one scrolling page of topic sections, each saved on its own. One tall form per
setting made the page several screens long; one Save for the whole page puts the button far from the
edit and lets one refused value block unrelated ones; autosave would save half-typed values. The
restart consequences are collected in one box, since every bridge setting waits for a restart.

Settings that can cut people off from the UI or weaken access protection (`http.host`, `http.port`,
`http.allowedHosts`, `tcp.host`) get no field: a wrong value saved from the UI might not be
reachable from the UI any more. `log.consoleSpeech` can start a speech feedback loop, and ports of
the child services, the log file and the line limit are rarely needed. All stay flags and config
file settings.

## The UI uses SvelteKit's experimental remote functions

Remote functions (`query`, `command` in `*.remote.ts`) replace a hand-written `+server.ts` route and a
`fetch` adapter with one typed function, and a query awaited during the server render goes into the page,
so the browser's first call needs no request. In this Kit version they are behind
`experimental.remoteFunctions`, and their API may change in a minor release. The dependencies are pinned
to exact versions, so a change only arrives with a deliberate upgrade. They are adopted one resource at a
time, starting with the sessions list (`lib/remote/sessions.remote.ts`). Two rules keep the layers:

- Only adapters (behind the `lib/core` ports) and server code call a remote function (`uiRemote` in
  `eslint.config.js`); stores and components still get the stores, so their tests are unchanged.
- Svelte's experimental async mode (`await` in components) stays off. On the server a query's `current`
  is always `undefined`, so the page's load awaits the query and the page seeds the store with the result
  while it renders.

