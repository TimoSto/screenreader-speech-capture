# Security

There is **no authentication** by default. Anyone who can reach the ports can:

- read what the screen reader said and change the configuration,
- **run programs on the VM**: Playwright's `run-server` accepts launch options from the client,
  such as `executablePath` and `args`, so access to port 3000 is effectively remote command execution,
- control a browser through MCP, and the desktop through the native input endpoints *(planned, [M4](ROADMAP.md#m4-native-input-))*.

Whoever can change the configuration also picks which published `playwright` version the bridge
installs and runs, older ones with known issues included. That adds nothing to the access that port
3000 already gives. The package name is fixed, the version must be an exact version number, and
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
  bridge's own address (`http://<host>:<port>`, as in their `Host` header). Clients outside a
  browser (the test client, `curl`) send no `Origin` and are not affected.

This covers the HTTP API on port 5151 only, not the Playwright server or MCP.
