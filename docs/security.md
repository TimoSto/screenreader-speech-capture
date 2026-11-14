# Security

There is **no authentication** by default. The bridge's HTTP port (`5151`) is the only one
reached from other machines: the API and the [Playwright server and MCP](playwright-mcp.md),
which the bridge passes through on `/playwright` and `/playwright-mcp`. Anyone who can reach it
can:

- read what the screen reader said and change the configuration,
- **run programs on the VM**: Playwright's `run-server` accepts launch options from the client,
  such as `executablePath` and `args`, so access to `/playwright` is effectively remote command execution,
- control a browser through MCP, and the desktop through the native input endpoints *(planned, [M4](ROADMAP.md#m4-native-input-))*.

Whoever can change the configuration also picks which published `playwright` version the bridge
installs and runs, older ones with known issues included. That adds nothing to the access that
`/playwright` already gives. The package name is fixed, the version must be an exact version number, and
npm install scripts are off, so no other package and no command line text gets in.

Use it only on isolated test VMs or networks. An optional shared-secret token is on the roadmap.

## Host and origin

An isolated network doesn't protect against the pages the VM's own browser opens. Such a page can
point a domain of its own at the bridge (DNS rebinding) and so read the API like a page of the
bridge, or send a form to it. The bridge refuses both with `403 FORBIDDEN`:

- **Host:** the API only answers requests whose `Host` header is an IP address, `localhost`, this
  machine's name (`os.hostname()`, also without its domain), or a name in
  [`http.allowedHosts`](configuration.md) (`--allowed-hosts`). Clients that reach the bridge
  through another DNS name need it there. `["*"]` turns the check off.
- **Origin:** `POST`, `PUT` and `DELETE` requests that carry an `Origin` header must come from the
  bridge's own address (`http://<host>:<port>`, as in their `Host` header). On `/playwright` and
  `/playwright-mcp` this holds for **every** request, reads and WebSocket handshakes included: a
  page may open a WebSocket to any address, and MCP answers reads with an event stream. Clients
  outside a browser (the test client, Playwright, MCP clients, `curl`) send no `Origin` and are
  not affected.

The Playwright server and MCP themselves listen on `127.0.0.1` (ports `3000` and `8931`), so other
machines can only reach them through the bridge and its checks. A page in the VM's own browser
can still reach those loopback ports directly. That is a known limit; the planned shared-secret
token is the answer to it.
