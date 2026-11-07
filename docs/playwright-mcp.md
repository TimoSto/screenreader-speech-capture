# Remote Playwright & MCP

The Playwright server and Playwright MCP that the bridge runs and supervises.

## Playwright server

The bridge runs `npx playwright@<version> run-server --port 3000 --host 0.0.0.0` as a supervised
child process. Connect from anywhere:

```ts
const browser = await chromium.connect('ws://my-test-vm:3000/', { headless: false });
```

The client's `@playwright/test` / `playwright` version must match the server's. Set
`--playwright-version` (or `playwright.version` in the config) to your test project's version. The
bridge installs it on first start. `GET /api/v1/status` reports the running version.

Remote launches are **headless by default**. A headless browser has no window, so the screen reader
can't read it. Always pass `headless: false` (the fixture does this for you).

## Playwright MCP

The bridge runs [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) in HTTP mode:

```
npx @playwright/mcp@<version> --port 8931 --host 0.0.0.0 --allowed-hosts *
```

`--allowed-hosts` is needed because MCP rejects requests from other hosts by default. Point an MCP
client at it:

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
