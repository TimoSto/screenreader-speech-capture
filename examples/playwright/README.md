# Example: Playwright tests with speech capture

Tests that drive a page and check what the screen reader says, using the client's
[Playwright fixture](../../docs/usage/client.md#playwright-fixture).

They need a VM with the bridge, a screen reader and the socket voice
([VM setup](../../docs/usage/vm-setup.md#checklist)), so they do not run in CI.

## Run them

1. Point them at the bridge: copy `.env.example` to `.env.local` (gitignored) and set the VM's
   address. `playwright.config.ts` loads it; `SR_SPEECH_URL` set in the shell wins, and without
   either the client uses its [stored URL](../../docs/usage/client.md#bridge-url).
2. From the repository root:

   ```bash
   pnpm --filter screenreader-speech-capture-example-playwright test
   ```

`@playwright/test` is pinned to `1.65.0`, the bridge's default Playwright version. A bridge started
with another `--playwright-version` needs the same version here
([Version](../../docs/usage/playwright-mcp.md#version)).

## What they show

| File | Test |
|---|---|
| `tests/announcements.spec.ts` | The page title and heading on load, a focused input, `Tab` to the next control, a live region update (a German page: the expected wording is German NVDA / JAWS speech). |
| `tests/native-input.spec.ts` | A screen reader command (`h`, next heading) as a native key with `recordKeys`, which returns what it caused, and `setFocus` bringing the window to the front. |

- `workers: 1` and `channel: 'chrome'` in `playwright.config.ts`: one screen reader, one foreground
  window, the browser real users run.
- Each test gets its own [session](../../docs/usage/speech-capture.md#sessions), and its speech is
  attached to the Playwright report as `speech-transcript`.
- Before each test the fixture gives the browser window OS-level focus, so native keys such as
  `pressKeys('h')` reach the page: the bridge brings the window to the front, or, where it can't, the
  fixture clicks the page content and reloads it
  ([Bringing the browser to the front](../../docs/usage/native-input.md#bringing-the-browser-to-the-front)).
  Set `speechCaptureFocus: false` in `use` where the bridge has no
  [native input](../../docs/usage/native-input.md).

## Use it in your own project

The example depends on the client through the workspace (`workspace:*`). In your own project,
install it pinned instead and copy `playwright.config.ts` and a test:

```bash
pnpm add -D screenreader-speech-capture-client@<version> @playwright/test@1.65.0 @types/node
```

The steps are in [Setting up a test project](../../docs/usage/client.md#setting-up-a-test-project).
