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
