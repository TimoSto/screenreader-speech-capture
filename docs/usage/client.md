# Test client (library + CLI)

The npm package for test code and agents: library, Playwright fixture and CLI.

Flows: [HTTP](flows/http.md), [live feed and waits](flows/sse.md), [truncation](flows/truncation.md), [agents](flows/agents.md).

`screenreader-speech-capture-client` is a small npm package for **test code and agents**. It talks
to the bridge's HTTP API and contains:

- a **TypeScript library** (`SpeechCaptureClient`) for Playwright or any other Node test runner.
  It ships its own type declarations; they refer to Node's types (`NodeJS.ProcessEnv`), so your
  project needs `@types/node`,
- a **Playwright fixture** (`screenreader-speech-capture-client/playwright` subpath export, [example tests](../../examples/playwright)),
- a **CLI** (`screenreader-speech-capture-client`) with the same functions, for AI agents and shell scripts,
- an **agent skill** (see [Agent skill](agents.md#agent-skill)) *(planned, [M6](../ROADMAP.md#m6-agents-))*.

On every answer, the client checks the bridge's API version (a response header) and throws `IncompatibleBridgeError`
if the major version differs (see [Versioning](http-api.md#versioning)). The client's package
version doesn't have to match the bridge's.

It only uses `fetch` (Node ≥ 20) and depends only on `packages/shared`. `@playwright/test` is an
optional peer dependency, needed only for the fixture; `setFocus(page)` of the library takes any page with `evaluate()`.

```bash
pnpm add -D screenreader-speech-capture-client
```

### Setting up a test project

For Playwright tests against a bridge on a VM ([VM setup](vm-setup.md#checklist) done):

1. Node ≥ 20 on the machine that runs the tests.
2. Install the client and its companions, pinned:
   `pnpm add -D screenreader-speech-capture-client@x.y.z @playwright/test@<version> @types/node`.
   `<version>` must be **exactly** the bridge's Playwright version: the one in `status`
   (`playwright.version`), set with `--playwright-version` on the bridge
   ([Version](playwright-mcp.md#version)).
3. No browser install on the test machine: the browser runs on the VM.
4. Point the client at the bridge: `npx screenreader-speech-capture-client config set url http://<vm>:5151`,
   or `SR_SPEECH_URL` in CI ([Bridge URL](#bridge-url)). `npx screenreader-speech-capture-client status`
   checks it.
5. `playwright.config.ts`: `workers: 1`, and `channel: 'chrome'` or `'msedge'` if those are installed on
   the VM ([Playwright fixture](#playwright-fixture)).
6. Import `test` and `expect` from `screenreader-speech-capture-client/playwright` instead of
   `@playwright/test`. The [example project](../../examples/playwright) has all of this.

For CI, see [Running in CI](#running-in-ci).

## Bridge URL

Set the bridge URL once per user, and the CLI, the library and the fixture all use it:

```bash
npx screenreader-speech-capture-client config set url http://my-test-vm:5151
```

The library, the fixture and the CLI use the first of these that is set:

1. passed explicitly: `baseUrl` (library), `speechCaptureUrl` (fixture) or `--url` (CLI)
2. env `SR_SPEECH_URL` (handy in CI)
3. `url` in the client config file
4. `http://localhost:5151`

The client config file is separate from the [bridge's config file](configuration.md), so a bridge
and a client on the same machine never share settings:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\screenreader-speech-capture\client.json` |
| Linux, macOS | `$XDG_CONFIG_HOME` (or `~/.config`), then `screenreader-speech-capture/client.json` |

Env `SR_SPEECH_CLIENT_CONFIG` points the client at a different file.

| Command | Description |
|---|---|
| `config set url <url>` | Store the URL. Only `http://` and `https://` are accepted, and a trailing slash is removed. It does not contact the bridge: use `status` for that. |
| `config get url` | Print the URL in use and where it comes from (`--url`, `SR_SPEECH_URL`, config file or default). With `--json`: `{ key, value, source }`. |
| `config unset url` | Remove the stored URL. |
| `config set output json` | Store the [output format](#output-format); `config get output` / `config unset output` as for the URL. |
| `config list` | All settings with their source. |
| `config path` | The path of the config file. |

An invalid URL or a broken config file gives exit code `3` and an error that names the file.

## Output format

What the CLI prints without `--json`: `text` (the default) or `json`. An agent sets it once, so a
call that forgets `--json` doesn't get a different shape:

```bash
npx screenreader-speech-capture-client config set output json
```

The CLI uses the first of these that is set: `--json`, env `SR_SPEECH_OUTPUT` (`json` or `text`),
`output` in the client config file, `text`. `SR_SPEECH_OUTPUT=text` gets text back for one shell
when the file says `json`. `--help` stays text unless `--json` is passed. An invalid value gives
exit code `3` for every command except `config`, which still works so the file can be repaired.
The library and the fixture don't use it.

## Library

```ts
import { SpeechCaptureClient } from 'screenreader-speech-capture-client';

const sr = new SpeechCaptureClient(); // URL from SR_SPEECH_URL or the config file, see Bridge URL
const vm = new SpeechCaptureClient({ baseUrl: 'http://my-test-vm:5151' }); // or pass it explicitly
// `clientName` (default `<host> pid <process id>`) names this client to the bridge, which warns
// when one client ends or replaces another one's session (http-api.md#clients).
```

The client reads the config file once, on its first request, and only if no explicit URL or
`SR_SPEECH_URL` is set.

### The cursor

Speech often arrives **before** your code starts waiting for it: the screen reader reacts to
`focus()` within milliseconds. So waiting can't start "from now". Instead every client keeps a
**cursor**: the `seq` of the last entry it consumed. `seq` is the ID of one entry
([data model](http-api.md#data-model)), and the cursor is the client's read position. Every function
with a `since` option uses the cursor as its default `since`, so it looks at entries with
`seq > cursor`.

- A new client starts at `0`. `startSession(name)` starts a [session](speech-capture.md#sessions)
  and moves the cursor to the session's start (its `startSeq`), so everything after it belongs to
  the session. The
  fixture does this before each test. Earlier sessions stay in the buffer for the
  [web UI](web-ui.md#context-pane).
- `clear()` wipes the whole buffer and sets the cursor back to `0`. It is meant for manual use;
  tests and agents start a session instead.
- `waitForOutput` / `waitForSequence` search **from the cursor**, so speech that already arrived
  is found. On a match the cursor moves to the matched entry, so the next wait only sees
  what came after it.
- `mark()` and an explicit `since` option let you control the range yourself.
- `cursor()` returns the current value, `setCursor(seq)` sets it.
- **Concurrent calls** on one client (`Promise.all` of two waits, a wait during `record`) are
  safe: each call reads the cursor when it is called, a finished wait or recording only moves the
  cursor **forward**, and an explicit move (`setCursor`, `clear`, `startSession`) wins over calls
  that were already running. Pass `since` when a call must read a fixed range.
- The cursor survives a bridge restart: `seq` keeps rising across runs
  ([data model](http-api.md#data-model)), so after a restart the next read or wait starts at the
  new run's first entry. The speech of the old run is gone.

### Functions

| Function | Returns | Description |
|---|---|---|
| `getSpeech({ since?, limit?, includeMarkers?, session?, allowTruncated? })` | `SpeechEntry[]` | Recorded speech entries, oldest first. `since` defaults to the cursor, `includeMarkers` to `false`. `session` (an `id` or `'current'`) returns only that session's entries; `'active'` the current session's, or all entries when none is current (API 1.23); without it, all entries. If some of them were dropped because the bridge's buffer was full, it throws `SpeechTruncatedError` (with what is left in `entries`), so an assertion never runs on a transcript with a gap; `allowTruncated: true` returns what is left instead. |
| `getText({ since?, separator?, session?, allowTruncated? })` | `string` | All speech since `since` (default: the cursor), joined into one string (`separator` default `'\n'`). Handy for snapshot assertions. Throws `SpeechTruncatedError` like `getSpeech`. |
| `startSession(name, { run? })` | `Session` + `replaced` | Start a [session](speech-capture.md#sessions) (the previous one ends) and move the cursor to its start. `run` groups sessions, for example of one test run. `replaced` is the session of another client it ended (`null` if none): a sign that two clients share the screen reader. The CLI prints a warning for it. |
| `endSession()` | `void` | End the current session. Speech after this belongs to no session. |
| `deleteSession(id)` | `void` | Delete an ended session and its speech from the bridge (needs API 1.16). Rejects with `BridgeHttpError` for the current session (`INVALID_REQUEST`) or an id the bridge never gave out (`NOT_FOUND`). The cursor stays where it is. |
| `sessions()` | `{ sessions, currentId }` | The sessions still in the buffer plus the current one, newest first. |
| `clear({ session? })` | `void` | Wipe the whole buffer (all sessions) and reset the cursor. For manual use. With `session` (`'current'`, the current session's id, `'active'` (that, or everything when none is current), or `'none'` for the speech outside sessions; needs API 1.17) it clears only that scope: the session keeps running and the cursor stays. Rejects with `BridgeHttpError` for an ended session (`INVALID_REQUEST`) or `'current'` with none current (`NOT_FOUND`). |
| `waitForOutput(match, { timeout?, since?, normalize?, session? })` | `SpeechEntry` | Wait until a speech entry after the cursor (or `since`) matches, then move the cursor past it. `match` is a `string` (substring), a `RegExp` or a predicate `(u) => boolean`. `normalize: true` ignores case and extra whitespace. `session` (an `id` or `'current'`) only matches that session's entries; `'current'` is the session current when the wait starts, even if another one starts meanwhile. `'active'` is the same, or all entries when none is current. Markers never match. Waits read the buffer, then follow the [live feed](#live-feed): no polling. Throws `SpeechTimeoutError` (with the speech seen so far in `entries`) on timeout. Default `timeout`: 5000 ms. |
| `waitForSequence(matches[], { timeout?, since?, normalize?, session? })` | `SpeechEntry[]` | Wait until the matches occur in this order (other entries may come in between). Moves the cursor past the last match. Throws `SpeechTimeoutError` like `waitForOutput`. |
| `waitForSilence({ quietFor?, timeout? })` | `void` | Wait until nothing new has been spoken for `quietFor` ms (default 500), counted from the call. Throws `SpeechTimeoutError` if speech goes on until `timeout` (default 10000 ms). Useful before asserting on "everything that was said". |
| `record(fn, { firstWithin?, quietFor?, timeout? })` | `{ result, entries, truncated }` | Run `fn` and return everything spoken while it ran and after it: waits up to `firstWithin` ms (default 2000) for the first speech, then until nothing new was said for `quietFor` ms (default 500), and moves the cursor to the end. Empty `entries`: nothing was said within `firstWithin`. `truncated: true`: some of it was dropped because the bridge's buffer was full, so `entries` is incomplete (raise `buffer.maxEntries`). Throws `SpeechTimeoutError` if speech goes on until `timeout` (default 10000 ms); its `entries` are everything recorded until then. |
| `mark(label)` | `SpeechEntry` | Insert a marker. Its `seq` can be used as `since`. |
| `findMarker(label, { session? })` | `SpeechEntry \| undefined` | The newest marker with this label (API 1.20), in `session` (an id, `'current'` or `'active'`) or in all entries. For a step marked in another process. `undefined` if there is none, also when it was dropped or cleared. |
| `setFocus(page, { target? })` | `void` | Make the page's browser window the OS foreground window. Without `target`, the bridge brings it forward if it started the browser (`bringToFront`); otherwise, and with `target`, a native click (on the title bar, or the centre of the `target` locator). See [Native input](native-input.md). |
| `bringToFront(page)` | `{ title, pid } \| null` | Ask the bridge to bring the page's window to the front (API 1.21), found by a marker in `document.title` ([how](native-input.md#bringing-the-browser-to-the-front)). `null` when the bridge can't (a browser it didn't start, not on Windows). Throws `BridgeHttpError` `FOCUS_FAILED` when Windows refused. |
| `focusMcpBrowser()` | `{ title, pid }` | Bring Playwright MCP's browser window to the front (API 1.21). `NOT_FOUND` before MCP opened its browser. |
| `click({ x, y }, { button? })` | `void` | Native click at screen coordinates in physical pixels (`POST /api/v1/input/click`). |
| `pressKeys(keys, { delayMs? })` | `void` | Native key presses, for screen reader commands (`'Insert+T'`, `['h', 'h']`). |
| `recordKeys(keys, { delayMs?, firstWithin?, quietFor?, timeout?, settle? })` | `{ entries, truncated, startSeq }` | `pressKeys` plus the speech it caused, recorded by the bridge ([Capturing the speech an input causes](native-input.md#capturing-the-speech-an-input-causes), API 1.19): like `record(() => pressKeys(keys))` with the same defaults, but the start is taken right before the keys and the silence is timed where the speech arrives. `settle` ms (default 0) first waits for that much silence. Throws `SpeechTimeoutError` like `record`. Doesn't move the cursor. |
| `recordClick({ x, y }, { button?, firstWithin?, quietFor?, timeout?, settle? })` | `{ entries, truncated, startSeq }` | The same for a click. |
| `onSpeech(cb, { since?, includeMarkers?, onSession?, onClear?, onTruncated?, onError? })` | `() => void` | Subscribe to the live feed (see [Live feed](#live-feed)). `cb` gets every new speech entry as the bridge receives it. Returns an unsubscribe function. |
| `status()` | `BridgeStatus` | Bridge health (TCP connections, Playwright/MCP state, versions, whether native input and focus work). |
| `waitForReady({ timeout? })` | `BridgeStatus` | Wait until the bridge answers and is `ready` (default `timeout` 120000 ms). Throws `BridgeNotReadyError` on timeout. |
| `playwrightEndpoint()` | `Promise<string>` | WebSocket URL of the bridge's Playwright server, for `browserType.connect()`. |

### Live feed

The bridge pushes every entry the moment it arrives, over
[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
(SSE): one long-lived HTTP response that the bridge keeps writing to. `onSpeech` and the CLI's
[`tail`](#cli-for-agents) wrap it, so you never parse the stream yourself, and they reconnect
without losing an entry ([sequence diagrams](flows/sse.md)).

`onSpeech` keeps a connection to [`GET /speech/stream`](http-api.md#endpoints) (Server-Sent
Events) open and calls `cb` for every new entry, with no polling:

```ts
const stop = sr.onSpeech((entry) => console.log(entry.text), {
  onError: (error, { retrying }) => console.warn(error.message, retrying ? '(reconnecting)' : ''),
});
// …
stop();
```

- It starts with the entries that arrive after the call. `since: <seq>` first replays the buffered
  entries after that `seq` (`since: 0`: the whole buffer).
- Markers are left out unless `includeMarkers: true`. `onSession(session)` is called when a
  session starts or ends (`endedAt` is set once it ended), `onClear` after a clear,
  `onTruncated` when entries of a replay were already dropped from the bridge's full buffer.
- It doesn't move the [cursor](#the-cursor): waits work the same with or without a feed.
- A lost connection is reconnected by itself (after 250 ms, doubling up to 5 s), and the bridge
  replays what was missed, so nothing is lost or repeated, also after a bridge restart: the feed goes
  on from the new bridge's first entry. This also holds when the connection drops before the first
  entry: the bridge's `position` event gives the feed its first cursor. If no data, not even the bridge's
  15 s ping, arrives for 45 s, the connection counts as lost.
- `onError(error, { retrying })`: `retrying: true` for a lost connection or an
  exception thrown by a callback (the feed goes on); `retrying: false` when the feed has stopped for good
  (`IncompatibleBridgeError`, an HTTP `4xx`, an invalid bridge URL).

### Errors

| Error | When |
|---|---|
| `SpeechTruncatedError` | `getSpeech` / `getText` without `allowTruncated`: some of the speech asked for was dropped because the bridge's buffer was full. `entries` holds what is left; the message suggests raising `buffer.maxEntries`. |
| `SpeechTimeoutError` | A wait ended without a match. `entries` holds the speech seen while waiting. `truncated: true` if speech the wait should have looked at was dropped because the bridge's buffer was full: the match may have been among it. The message then says so and suggests raising `buffer.maxEntries`. |
| `BridgeNotReadyError` | `waitForReady` timed out. |
| `BridgeUnreachableError` | No connection to the bridge (wrong URL, bridge not running, network). |
| `BridgeHttpError` | The bridge answered with an [error](http-api.md#errors): `status`, `code`, `details`. |
| `IncompatibleBridgeError` | The bridge has another major API version (see [Versioning](http-api.md#versioning)). |
| `ClientConfigError` | Invalid bridge URL or client config file. |

## Playwright fixture

```ts
// tests/form.spec.ts
import { test, expect } from 'screenreader-speech-capture-client/playwright';

test('submit button is announced', async ({ page, speech, pressKeys }) => {
  await page.goto('https://example.org/form');

  // Playwright input: focus changes are announced
  await page.getByRole('button', { name: 'Submit' }).focus();
  await speech.waitForOutput('Submit, button'); // found even if it arrived before this line

  const { entries } = await speech.record(() => page.keyboard.press('Tab'));
  expect(entries.map((e) => e.text)).toContain('Name, edit, blank');

  // Native input: a screen reader command (NVDA browse mode, next heading)
  await pressKeys('h');
  await speech.waitForOutput(/heading, level 2/);
});
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  workers: 1,
  use: {
    speechCaptureUrl: 'http://my-test-vm:5151', // optional, see Bridge URL
    channel: 'chrome',                          // or 'msedge': the browsers real users run
  },
});
```

The fixture:

- sets Playwright's `connectOptions.wsEndpoint` to the bridge's Playwright server
  (`ws://<bridge>/playwright`, [Remote Playwright & MCP](playwright-mcp.md)) and forces
  `headless: false`, so `page` opens visibly in the VM's desktop session where the screen reader runs,
- gives the browser window OS-level focus before each test, so native keys reach the page: the
  bridge [brings it to the front](native-input.md#bringing-the-browser-to-the-front) (it started the
  browser). Where it can't, the fixture reads where the page content starts, clicks its top-left
  corner with a [native click](native-input.md), and reloads the page, so the click leaves no trace
  in it (turn off with `speechCaptureFocus: false`, needed where the bridge has no native input).
  Pages the test opens later need `setFocus()` again,
- provides the [native input](native-input.md) as fixtures: `click(point, options?)` (screen
  coordinates in physical pixels), `pressKeys(keys, options?)` and `setFocus()` (the same, for the
  test's `page`),
- starts a [session](speech-capture.md#sessions) per test before it runs (`startSession`, named
  after the test's title path, with one `run` label per Playwright run) and ends it after the test.
  It doesn't clear the buffer, so earlier tests stay visible in the [web UI](web-ui.md#context-pane),
- attaches the speech transcript of the test (its session) to the Playwright report (always, or only on failure,
  set with `speechCaptureAttach: 'always' | 'on-failure' | 'off'`, default `'always'`).

> Tests that use the screen reader must run **serially** (`workers: 1`). There is only one screen
> reader, and only one window can be in the foreground.

> Use **Chrome / Edge** (`channel`) or Playwright's Chromium. For Firefox and WebKit, see
> [Limitations](limitations.md#browsers).

### Running in CI

A CI job that runs screen reader tests against a VM, in this order:

1. Make sure the VM is fresh where it needs to be: an unlicensed JAWS stops talking after about 40
   minutes, so reset the snapshot or restart Windows before the run
   ([Screen reader licensing](vm-setup.md#screen-reader-licensing)). The bridge runs in the
   logged-in, unlocked user session ([Running on the VM](vm-setup.md#running-on-the-vm)).
2. Set `SR_SPEECH_URL=http://<vm>:5151` in the job's environment ([Bridge URL](#bridge-url)).
3. Wait for the bridge: `npx screenreader-speech-capture-client status --wait-ready` (exit `1`: not
   ready in time, `2`: not reachable). Its output shows whether the screen reader is connected
   (`tcp.connections`) and whether native input works (`input`).
4. Run Playwright with `workers: 1` and the client's Playwright version matching the bridge's
   ([Version](playwright-mcp.md#version)). The fixture starts a session per test with one `run`
   label for the whole run.
5. Keep the Playwright report as a job artifact: every test has its speech transcript attached
   (`speechCaptureAttach`).

## CLI for agents

The CLI command has the same name as the package, `screenreader-speech-capture-client`.

### Running the CLI

| Where | Install | Call |
|---|---|---|
| An agent's machine (recommended for agents) | `npm i -g screenreader-speech-capture-client@<version>`, once | `screenreader-speech-capture-client …` |
| A project that has the client already (tests) | `pnpm add -D screenreader-speech-capture-client` | `npx screenreader-speech-capture-client …` (runs the project's copy) |
| One-off, nothing installed | none | `npx -y screenreader-speech-capture-client@<version> …` |

Always pin an exact version. An unpinned `npx` looks the package up on every call and runs whatever
is newest: while the package is at `0.x`, a minor release may change the CLI (`@0` doesn't prevent
that), and a new major API version fails with `IncompatibleBridgeError` against an older bridge
([Versioning](http-api.md#versioning)). Update a global install by installing again, and keep it
in step with the bridge: `--version` prints the client's version, `status` the bridge's API version.
`-y` skips npx's install prompt, which would block an agent. The examples below use the `npx`
form, which also finds a global install.

### Commands

Every command takes `--url` (overrides the [stored bridge URL](#bridge-url)) and `--json` for
machine-readable output (the shape of every command is the valibot schema in
`packages/client/src/adapters/in/cli/output.ts`; `config set output json` makes it the
[default](#output-format)). `<command> --help` shows that command's usage and options.
`--help --json` describes every command for a program: its usage, options and the JSON Schema of
its `--json` output, plus the error object, exit codes and environment variables;
`<command> --help --json` only that command. A CLI call has no memory between invocations, so there is no
cursor. Instead, `speech`, `text` and `wait` read the **current
[session](speech-capture.md#sessions)** (everything since `session start`) by default, or the whole
buffer when no session is current (`session=active`, which the bridge resolves in the same request).
`--session <id>` picks another one, `--session current` the
current one explicitly (with none current that is a `BridgeHttpError` `NOT_FOUND`, exit `2`), and
`--all` ignores sessions. `clear` takes the same words.
So `wait "button"` also matches what an *earlier* step said: use `mark` and `--since` to look at
a smaller range, or `--capture` on `press` / `click` (below) to get exactly the speech an action
caused.

`--since` (on `speech`, `text`, `wait` and `tail`) takes a `seq` (also as printed, `#4712`) or
`mark:<label>`: the newest
marker with that label in the scope the command reads (the bridge looks it up with
`GET /markers/latest`; `tail` looks in the whole buffer). `mark step-2` in one call and
`text --since mark:step-2` in a later one need no number in between. No such marker (never set,
set in another session, or dropped from the full buffer) is a usage error, exit `3`.

```bash
npx screenreader-speech-capture-client config set url http://my-test-vm:5151   # once, see Bridge URL
npx screenreader-speech-capture-client status [--wait-ready] [--timeout 120000]
npx screenreader-speech-capture-client session start "checkout flow" [--run <label>]   # prints the session id
npx screenreader-speech-capture-client session end
npx screenreader-speech-capture-client session delete <id>   # an ended session and its speech
npx screenreader-speech-capture-client session list
npx screenreader-speech-capture-client clear --all           # wipes everything, all sessions (a bare clear is a usage error)
npx screenreader-speech-capture-client clear --session current   # only the current session's speech; it keeps running
npx screenreader-speech-capture-client clear --outside        # only the speech outside sessions
npx screenreader-speech-capture-client speech [--since <seq>] [--limit <n>] [--include-markers] [--session <id|current> | --all]
npx screenreader-speech-capture-client text [--since <seq>] [--separator <s>] [--session <id|current> | --all]
npx screenreader-speech-capture-client wait "Submit, button" [--regex] [--normalize] [--timeout 5000] [--since <seq>] [--session <id|current> | --all]
npx screenreader-speech-capture-client wait-silence [--quiet-for 500] [--timeout 10000]
npx screenreader-speech-capture-client mark "before tab"   # prints "#<seq> [marker] before tab"; later: --since "mark:before tab"
npx screenreader-speech-capture-client focus                # bring Playwright MCP's browser to the front
npx screenreader-speech-capture-client focus --script       # fallback: the function to run with Playwright MCP's browser_evaluate
npx screenreader-speech-capture-client focus --geometry '<its JSON result>' [--capture]   # … then click the browser's title bar
npx screenreader-speech-capture-client click --x 640 --y 12  # native click (negative: --x=-5)
npx screenreader-speech-capture-client press "Insert+T"      # native keys, several args = sequence (--delay <ms>)
npx screenreader-speech-capture-client press h --capture [--first-within 2000] [--quiet-for 500] [--timeout 10000] [--settle 0]   # … and print the speech it caused (also click)
npx screenreader-speech-capture-client tail [--since <seq>]  # live feed until Ctrl+C (NDJSON with --json)
```

Exit codes, so agents can branch on them without parsing output:

| Code | Meaning |
|---|---|
| `0` | Success (for `wait`: match found) |
| `1` | Timeout / no match (also `status --wait-ready`, `wait-silence`, and `--capture` when the speech didn't pause): a [result with a `status`](#results-and-errors), not an error |
| `2` | Bridge not reachable, HTTP error, or incompatible bridge version |
| `3` | Invalid usage or invalid client config |
| `4` | Internal error: a bug in the client (the stack goes to stderr; please report it) |

### Results and errors

One rule tells what a command's exit code comes with:

| Exit code | Meaning | With `--json` |
|---|---|---|
| `0` | Success. | The command's result. |
| `1` | An expected outcome that isn't success: a wait timed out, the bridge wasn't ready in time. | The command's result, with a `status` that says what happened, and the data seen. |
| `2`–`4` | Something went wrong. | An [error object](#errors-with---json). |

The commands that wait put a `status` in their result:

| Command | `status` with exit `0` | `status` with exit `1` |
|---|---|---|
| `wait` | `matched` (with `entry`) | `timeout` (with the `entries` seen and `truncated`) |
| `wait-silence` | `silent` | `timeout` (with the `entries` seen and `truncated`) |
| `press` / `click` / `focus --geometry` with `--capture` | `silent`, or `no-speech` when nothing was said | `timeout` (with what was said until then) |
| `status --wait-ready` | `ready` (with the bridge status) | `not-ready` (with the `reason`) |

Without `--json`, an exit `1` prints nothing on stdout (except `--capture`, which prints what was
said) and the message on stderr.

### Errors with `--json`

With `--json`, stdout is always JSON: a failed command prints one error object there instead of
its output (and `tail` ends with it as its last line). The message also goes to stderr, as without
`--json`, where stdout stays empty.

```json
{"error":{"type":"BridgeHttpError","message":"Native input is not available (HTTP 409, INPUT_DISABLED)","status":409,"code":"INPUT_DISABLED"}}
```

| `type` | Exit code | Meaning |
|---|---|---|
| `UsageError` | `3` | Wrong command, arguments or options (also an unknown [key name](native-input.md#key-names) for `press`); the message names the problem or prints the usage. |
| `ClientConfigError` | `3` | Invalid bridge URL or client config file. |
| `BridgeUnreachableError` | `2` | No connection: wrong URL, bridge not running, network. Retrying (or `status --wait-ready`) may help. |
| `BridgeHttpError` | `2` | The bridge refused the request. Also has `status`, `code` (for example `INPUT_DISABLED`, `NOT_FOUND`, `INVALID_REQUEST`) and, if sent, `details` (for example `field`) from the [error](http-api.md#errors). Retrying the same call won't help. |
| `IncompatibleBridgeError` | `2` | Another major API version: install matching versions. |
| `InternalError` | `4` | A bug in the client. |

A timeout is never an error object but a [result](#results-and-errors). The schema is
`CliErrorOutput` in `packages/client/src/adapters/in/cli/output.ts`.

`session start` prints the new session's id (the whole session with `--json`). `session list`
prints one line per session, newest first (`#7 checkout test (run nightly-42): current, 3 entries,
seq 340-342`), or `{ sessions, currentId }` with `--json`. Without a current session, `speech`, `text` and
`wait` read the whole buffer.

If some of the speech `speech` or `text` asks for was dropped because the bridge's buffer was full,
they print what is left, warn on stderr and still exit `0`; with `--json` they add
`"truncated": true`.
When there is no speech to show, they print nothing on stdout (the empty result with `--json`),
`no speech` on stderr, and exit `0`.

With `--json`, `wait` prints `{ "status": "matched", "entry": {...} }`, or on timeout
`{ "status": "timeout", "entries": [...], "truncated": false }` with the speech seen, and
`truncated: true` if some of it was dropped because the bridge's buffer was full. `wait-silence`
prints `{ "status": "silent" }`, or on timeout the same `timeout` result. On a timeout, stderr lists the speech seen, and if one of those entries
matches when case and extra whitespace are ignored, a hint to use `--normalize`.
`mark` prints the marker as `speech --include-markers` does (`#4712 [marker] step-2`), or the
whole entry with `--json`.

`focus` brings the browser Playwright MCP drives to the foreground, for
[native input](native-input.md): the bridge finds the window of the browser it started and brings
it to the front ([how](native-input.md#bringing-the-browser-to-the-front)), and the command prints
`{ "focused": true, "window": { "title", "pid" } }`. Before MCP opened its browser that is
`NOT_FOUND` (exit `2`). For a browser the bridge didn't start, or a bridge without window support,
there is the click fallback: `focus --script` prints the function `setFocus`
evaluates (`{ "script": "() => ({…})" }` with `--json`). Run it with MCP's `browser_evaluate` and
pass its result to `focus --geometry '<json>'`, which clicks the middle of the window's title bar,
like `setFocus(page)`, and prints `{ "focused": true, "point": { "x": …, "y": … } }`. A value that
isn't that object is a usage error (exit `3`).

`press` and `click` print `{ "pressed": true }` / `{ "clicked": true }` with `--json`. With
`--capture` (also on `focus --geometry`) the bridge records the speech the action causes, in one
request ([`recordKeys` / `recordClick`](#functions)): it notes where the buffer ends right before
the input, waits up to `--first-within` ms (default 2000) for the screen reader to start
talking, then until nothing was spoken for `--quiet-for` ms (default 500, all at most `--timeout`,
default 10000), and the command prints the speech from that point on, one line per entry, or
`{ "pressed": true, "entries": [...], "truncated": false, "status": "silent" }` with `--json`. Speech
from before the action can't get in; `--settle <ms>` also keeps out speech that is still trailing
from the previous step, by waiting for that much silence before the input. Raise `--first-within` for actions the screen reader is slow
to announce (a page load, a dialog). When nothing was said, stdout stays empty (`"status": "no-speech"`
and `"entries": []` with `--json`) and stderr says `no speech after the action`. If the speech doesn't pause in time,
the action has still happened: the command prints what was said until then with
`"status": "timeout"`, the timeout on stderr, and exits with `1`.

`tail` is for people watching (agents use `wait`, `wait-silence` or `--capture`). It prints each entry as it arrives (`#12 Submit, button`, markers included) until Ctrl+C or
`SIGTERM`, then exits with `0`. A closed pipe (`tail --json | head -3`) ends it too, once the next
line is written. By default it shows only new speech; `--since
<seq>` first prints the buffered entries after `seq`. With `--json` it prints one event per line:
`{"type":"entry","entry":{...}}`, `{"type":"session","session":{...}}` (a session started or
ended), `{"type":"clear"}` and `{"type":"truncated"}`. If the bridge is
not reachable at the start it exits with `2`; a connection lost later is reconnected (with a note
on stderr) without losing entries. An error a reconnect can't fix (an HTTP `4xx`, an incompatible
bridge) ends it with exit code `2`, and with `--json` with the
[error object](#errors-with---json) as the last line.

For the typical agent loop, see [Agents](agents.md#agent-loop).
