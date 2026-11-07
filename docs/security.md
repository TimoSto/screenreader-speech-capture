# Security

There is **no authentication** by default. Anyone who can reach the ports can:

- read what the screen reader said and change the configuration,
- **run programs on the VM**: Playwright's `run-server` accepts launch options from the client,
  such as `executablePath` and `args`, so access to port 3000 is effectively remote command execution,
- control the desktop through the native input endpoints and a browser through MCP.

Use it only on isolated test VMs or networks. An optional shared-secret token is on the roadmap.
