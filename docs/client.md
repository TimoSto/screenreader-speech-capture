# Test client (library + CLI)

The npm package for test code and agents: library, Playwright fixture and CLI.

`screenreader-speech-capture-client` is a small npm package for **test code and agents**. It talks
to the bridge's HTTP API and contains:

- a **TypeScript library** (`SpeechCaptureClient`) for Playwright or any other Node test runner,
- a **Playwright fixture** (`/playwright` subpath export),
- a **CLI** (`screenreader-speech-capture-client`, alias `sr-speech`) with the same functions, for AI agents and shell scripts,
- an **agent skill** (see [Agent skill](agents.md#agent-skill)).

On its first call, the client checks the bridge's API version and throws `IncompatibleBridgeError`
if the major version differs (see [Versioning](http-api.md#versioning)).

It only uses `fetch` (Node ≥ 20) and depends only on `packages/shared`. `@playwright/test` is an
optional peer dependency, needed only for the fixture and `setFocus(page)`.

```bash
pnpm add -D screenreader-speech-capture-client
```

## Library

```ts
import { SpeechCaptureClient } from 'screenreader-speech-capture-client';

const sr = new SpeechCaptureClient({ baseUrl: 'http://my-test-vm:5151' }); // or env SR_SPEECH_URL
```

### The cursor

Speech often arrives **before** your code starts waiting for it: the screen reader reacts to
`focus()` within milliseconds. So waiting can't start "from now". Instead every client keeps a
**cursor** (a `seq`):

- `clear()` sets the cursor to the end of the buffer (the fixture calls it before each test).
- `waitForOutput` / `waitForSequence` search **from the cursor**, so speech that already arrived
  is found. On a match the cursor moves past the matched entry, so the next wait only sees
  what came after it.
- `mark()` and an explicit `since` option let you control the range yourself.
- `cursor()` returns the current value, `setCursor(seq)` sets it.

### Functions

| Function | Returns | Description |
|---|---|---|
| `getSpeech({ since?, limit?, includeMarkers? })` | `SpeechEntry[]` | Recorded speech entries, oldest first. `since` defaults to the cursor. |
| `getText({ since?, separator? })` | `string` | All speech since `since` (default: the cursor), joined into one string. Handy for snapshot assertions. |
| `clear()` | `void` | Clear the buffer and reset the cursor. |
| `waitForOutput(match, { timeout?, since?, normalize? })` | `SpeechEntry` | Wait until a speech entry after the cursor (or `since`) matches, then move the cursor past it. `match` is a `string` (substring), a `RegExp` or a predicate `(u) => boolean`. `normalize: true` ignores case and extra whitespace. Throws `SpeechTimeoutError` (with the entries seen so far) on timeout. Default `timeout`: 5000 ms. |
| `waitForSequence(matches[], { timeout?, since?, normalize? })` | `SpeechEntry[]` | Wait until the matches occur in this order (other entries may come in between). Moves the cursor past the last match. |
| `waitForSilence({ quietFor?, timeout? })` | `void` | Wait until nothing has been spoken for `quietFor` ms (default 500). Useful before asserting on "everything that was said". |
| `record(fn)` | `{ result, entries }` | Run `fn` and return everything spoken while it ran (waits for silence at the end, then moves the cursor to the end). |
| `mark(label)` | `SpeechEntry` | Insert a marker. Its `seq` can be used as `since`. |
| `setFocus(page, { target? })` | `void` | Make the page's browser window the OS foreground window with a native click (on the title bar, or the centre of the `target` locator). See [Native input](native-input.md). |
| `click({ x, y })` | `void` | Native click at screen coordinates (`POST /api/v1/set-focus`). |
| `pressKeys(keys, { delayMs? })` | `void` | Native key presses, for screen reader commands (`'Insert+T'`, `['h', 'h']`). |
| `onSpeech(cb)` | `() => void` | Subscribe to the live SSE feed. Returns an unsubscribe function. |
| `status()` | `Status` | Bridge health (TCP connections, Playwright/MCP state, versions). |
| `playwrightEndpoint()` | `string` | WebSocket URL of the bridge's Playwright server, for `browserType.connect()`. |

## Playwright fixture

```ts
// tests/form.spec.ts
import { test, expect } from 'screenreader-speech-capture-client/playwright';

test('submit button is announced', async ({ page, speech }) => {
  await page.goto('https://example.org/form');

  // Playwright input: focus changes are announced
  await page.getByRole('button', { name: 'Submit' }).focus();
  await speech.waitForOutput('Submit, button'); // found even if it arrived before this line

  const { entries } = await speech.record(() => page.keyboard.press('Tab'));
  expect(entries.map((e) => e.text)).toContain('Name, edit, blank');

  // Native input: a screen reader command (NVDA browse mode, next heading)
  await speech.pressKeys('h');
  await speech.waitForOutput(/heading, level 2/);
});
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  workers: 1,
  use: {
    speechCaptureUrl: 'http://my-test-vm:5151', // fixture option (or env SR_SPEECH_URL)
    channel: 'chrome',                          // or 'msedge': the browsers real users run
  },
});
```

The fixture:

- sets Playwright's `connectOptions.wsEndpoint` to the bridge's Playwright server and forces
  `headless: false`, so `page` opens visibly in the VM's desktop session where the screen reader runs,
- calls `setFocus(page)` after the page is created (turn off with `speechCaptureFocus: false`),
- clears the speech buffer and resets the cursor before each test,
- attaches the speech transcript of the test to the Playwright report (always, or only on failure,
  set with `speechCaptureAttach: 'always' | 'on-failure' | 'off'`).

> Tests that use the screen reader must run **serially** (`workers: 1`). There is only one screen
> reader, and only one window can be in the foreground.

> Use **Chrome / Edge** (`channel`) or Playwright's Chromium. For Firefox and WebKit, see
> [Limitations](limitations.md#browsers).

## CLI for agents

The package installs two names for the same CLI:

| Command | Use it when |
|---|---|
| `screenreader-speech-capture-client` | Always works with `npx`, even where nothing is installed, because it's the same as the package name. **Use this one in agent prompts, scripts and CI.** |
| `sr-speech` | Short alias. Only available when the package is installed (in the project, or globally with `npm i -g`). |

Every command takes `--url` (or env `SR_SPEECH_URL`, default `http://localhost:5151`) and `--json`
for machine-readable output. A CLI call has no memory between invocations, so there is no
cursor. Use `mark` and `--since` instead.

```bash
npx screenreader-speech-capture-client status [--wait-ready] [--timeout 120000]
npx screenreader-speech-capture-client clear
npx screenreader-speech-capture-client speech [--since <seq>] [--limit <n>]
npx screenreader-speech-capture-client text [--since <seq>]
npx screenreader-speech-capture-client wait "Submit, button" [--regex] [--normalize] [--timeout 5000] [--since <seq>]
npx screenreader-speech-capture-client wait-silence [--quiet-for 500] [--timeout 10000]
npx screenreader-speech-capture-client mark "before tab"   # prints the marker's seq
npx screenreader-speech-capture-client focus --x 640 --y 12  # native click
npx screenreader-speech-capture-client press "Insert+T"      # native keys; several args = sequence
npx screenreader-speech-capture-client tail                # live feed until Ctrl+C (NDJSON with --json)

# installed, same commands with the alias:
sr-speech wait "Submit, button"
```

Exit codes, so agents can branch on them without parsing output:

| Code | Meaning |
|---|---|
| `0` | Success (for `wait`: match found) |
| `1` | Timeout / no match |
| `2` | Bridge not reachable, HTTP error, or incompatible bridge version |
| `3` | Invalid usage |

For the typical agent loop, see [Agents](agents.md#agent-loop).
