# Remote Playwright & MCP

The Playwright server and Playwright MCP that the bridge runs and supervises.

Both listen on `127.0.0.1` only. Clients reach them through the bridge's HTTP port (`5151`), on
fixed paths:

| Service | URL |
|---|---|
| Playwright server | `ws://my-test-vm:5151/playwright` |
| Playwright MCP | `http://my-test-vm:5151/playwright-mcp` |

The bridge passes the requests on unchanged, apart from the path and the `Host` header. It applies
the same [Host and origin](security.md#host-and-origin) rules as for the API, so a name that isn't
an IP address needs `http.allowedHosts`, and a request from a web page with a foreign `Origin` is
refused, even a read. A service that is disabled or not running yet answers
`503 SERVICE_UNAVAILABLE`, in the [error format](http-api.md#errors) of the API. The bridge log's
startup lines list the URLs ([Line format](operations.md#line-format)). The paths are exported by
the shared contract as `PLAYWRIGHT_PATH` and `PLAYWRIGHT_MCP_PATH`.

## Playwright server

The bridge runs `playwright run-server --port 3000 --host 127.0.0.1` as a supervised child process
(restarts, process-tree kill: see [Operations](operations.md#child-service-crashes)). Connect from
anywhere with the same Playwright version, through the bridge:

```ts
// @playwright/test (playwright.config.ts): `headless` from `use` is sent to the server.
use: { headless: false, connectOptions: { wsEndpoint: 'ws://my-test-vm:5151/playwright' } }

// Plain `playwright`: launch options go in a header, `connect()` has no `headless` option.
const browser = await chromium.connect('ws://my-test-vm:5151/playwright', {
  headers: { 'x-playwright-launch-options': JSON.stringify({ headless: false }) },
});
```

Remote launches are **headless by default**. A headless browser has no window, so the screen reader
can't read it. Always launch with `headless: false` (the fixture will do this for you, [M3](ROADMAP.md#m3-playwright--mcp-)). The bridge
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
node <bridge>/node_modules/@playwright/mcp/cli.js
  --port 8931 --host 127.0.0.1 --browser chromium --isolated
```

- MCP's own host check stays on (it accepts loopback names only): the bridge sends it a loopback
  `Host` and does the check for the clients' host names itself.
- `--browser chromium`: Playwright's Chromium (Chrome for Testing), which the bridge installs. MCP's
  default would be branded Chrome. The browser is headed, so the screen reader can read it.
- `--isolated`: every MCP session gets a fresh browser profile in memory. Nothing (cookies,
  logins) carries over between sessions, and several clients don't fight over one profile on disk.

Point an MCP client at the bridge's `/playwright-mcp` path:

```json
{
  "mcpServers": {
    "screenreader-vm": {
      "url": "http://my-test-vm:5151/playwright-mcp"
    }
  }
}
```

An agent can then drive the browser through MCP and read the screen reader output through the
CLI or the HTTP API above.

> The MCP browser and a browser started by a test through the Playwright server are **separate
> windows**. The screen reader reads whichever is in the foreground, so use only one at a time and
> bring the right one to the front after switching (CLI `focus`, [M4](ROADMAP.md#m4-native-input-)).

### MCP version

`@playwright/mcp` is a dependency of the bridge, pinned to an exact version (`packages/bridge/
package.json`). A new MCP version comes with a new bridge release; it can't be configured. Unlike the
Playwright server, MCP has no client that must match its version: clients speak MCP over HTTP.
MCP brings its own Playwright, independent of `--playwright-version`. `GET /api/v1/status` reports
the version that runs.

### MCP install

The package arrives with the bridge (`npm i -g screenreader-speech-capture`). Only **the Chromium
of MCP's Playwright** is installed at runtime, on every start: `cli.js install-browser --no-shell
chromium`. It downloads only when that build is missing (into `%LOCALAPPDATA%\ms-playwright`, like
the [Playwright server's](#install)). It can be a different build than the Playwright server's, so
the first start may download a second Chromium.

The output appears under `[playwright-mcp]` in the bridge log.
