# Remote Playwright & MCP

The Playwright server and Playwright MCP that the bridge runs and supervises.

## Playwright server

The bridge runs `playwright run-server --port 3000 --host 0.0.0.0` as a supervised child process
(restarts, process-tree kill: see [Operations](operations.md#child-service-crashes)). Connect from
anywhere with the same Playwright version, to a `ws://` URL from the bridge log's
`playwright running on …, reachable at …` line ([Line format](operations.md#line-format)):

```ts
// @playwright/test (playwright.config.ts): `headless` from `use` is sent to the server.
use: { headless: false, connectOptions: { wsEndpoint: 'ws://my-test-vm:3000/' } }

// Plain `playwright`: launch options go in a header, `connect()` has no `headless` option.
const browser = await chromium.connect('ws://my-test-vm:3000/', {
  headers: { 'x-playwright-launch-options': JSON.stringify({ headless: false }) },
});
```

Remote launches are **headless by default**. A headless browser has no window, so the screen reader
can't read it. Always launch with `headless: false` (the fixture does this for you). The bridge
doesn't install Playwright's headless-only browser, so a headless launch fails with
`Executable doesn't exist at …chrome-headless-shell` instead of running unseen.

### Version

The client's `@playwright/test` / `playwright` version must match the server's. Set
`--playwright-version` (or `playwright.version` in the config) to your test project's version. It
must be an exact version like `1.65.0` (no ranges or tags). Without it, the bridge uses its bundled
default (`DEFAULT_PLAYWRIGHT_VERSION`, currently `1.65.0`). `GET /api/v1/status` reports the
version that runs.

### Install

The bridge installs what it needs automatically. Nobody has to run an install step:

1. **The package**, once per version: `npm install playwright@<version>` into
   `%LOCALAPPDATA%\screenreader-speech-capture\playwright\<version>` (on Linux and macOS:
   `$XDG_CACHE_HOME` or `~/.cache`, then `screenreader-speech-capture/playwright/<version>`). npm
   install scripts are off. The install happens in a temporary folder that is renamed when it is
   complete, so an interrupted install leaves nothing half-done.
2. **Playwright's Chromium** for that version, on every start of the service:
   `playwright install --no-shell chromium`. It downloads only when that build is missing (into
   Playwright's usual browser folder, `%LOCALAPPDATA%\ms-playwright`).

The first start of a new version takes a minute or two. The service is `starting` meanwhile, and
the output appears under `[playwright-server]` in the bridge log. If the install fails (offline,
proxy), the service counts it as a crash and retries. Branded Chrome / Edge are not installed
automatically (their installers need administrator rights, see [VM setup](vm-setup.md#requirements)).

## Playwright MCP

The bridge runs [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) in HTTP mode as a
second supervised child service (same restarts and process-tree kill as the Playwright server):

```
node <cache>/mcp/<version>/node_modules/@playwright/mcp/cli.js
  --port 8931 --host 0.0.0.0 --allowed-hosts * --browser chromium --isolated
```

- `--allowed-hosts *`: MCP rejects requests for other host names by default, so clients on other
  machines would be turned away.
- `--browser chromium`: Playwright's Chromium (Chrome for Testing), which the bridge installs. MCP's
  default would be branded Chrome. The browser is headed, so the screen reader can read it.
- `--isolated`: every MCP session gets a fresh browser profile in memory. Nothing (cookies,
  logins) carries over between sessions, and several clients don't fight over one profile on disk.

Point an MCP client at one of the URLs from the bridge log's `mcp running on …, reachable at …`
line ([Line format](operations.md#line-format)):

```json
{
  "mcpServers": {
    "screenreader-vm": {
      "url": "http://my-test-vm:8931/mcp"
    }
  }
}
```

An agent can then drive the browser through MCP and read the screen reader output through the
CLI or the HTTP API above.

> The MCP browser and a browser started by a test through the Playwright server are **separate
> windows**. The screen reader reads whichever is in the foreground, so use only one at a time and
> call `focus` after switching.

### MCP version

`--mcp-version` (or `mcp.version` in the config) selects the `@playwright/mcp` version, exact like
`0.0.85`. Without it, the bridge uses its bundled default (`DEFAULT_MCP_VERSION`, currently
`0.0.85`). MCP brings its own Playwright, so its version is independent of `--playwright-version`.
`GET /api/v1/status` reports the version that runs.

### MCP install

Like the [Playwright server](#install), automatic:

1. **The package**, once per version: `npm install @playwright/mcp@<version>` into
   `%LOCALAPPDATA%\screenreader-speech-capture\mcp\<version>` (on Linux and macOS:
   `$XDG_CACHE_HOME` or `~/.cache`, then `screenreader-speech-capture/mcp/<version>`), install
   scripts off, through a temporary folder.
2. **The Chromium of MCP's Playwright**, on every start: `cli.js install-browser --no-shell
   chromium`. It downloads only when that build is missing. It can be a different build than the
   Playwright server's, so the first start may download a second Chromium.

The output appears under `[playwright-mcp]` in the bridge log.
