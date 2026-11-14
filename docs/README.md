# Documentation

[Roadmap](ROADMAP.md): milestones, what works today and what is still design.

## Usage

For people who set up the VM, write tests or run agents against the bridge.

| Doc | What it covers |
|---|---|
| [VM setup](usage/vm-setup.md) | Requirements, socket voice, NVDA / JAWS setup, running the bridge on the VM |
| [Speech capture](usage/speech-capture.md) | What the socket voice sends, the buffer, sessions |
| [HTTP API](usage/http-api.md) | Data model, endpoints, errors, versioning ([OpenAPI](usage/openapi.yaml)) |
| [Test client](usage/client.md) | Library, cursor, Playwright fixture, CLI and exit codes ([`--json` schema](usage/cli-output.schema.json)) |
| [Native input](usage/native-input.md) | Real clicks and key presses: when Playwright input isn't enough (planned) |
| [Remote Playwright & MCP](usage/playwright-mcp.md) | The Playwright server and Playwright MCP run by the bridge |
| [Agents](usage/agents.md) | Agent loop with the CLI, agent skill (partly planned) |
| [Web UI](usage/web-ui.md) | Live log, settings, setup page (planned) |
| [Configuration](usage/configuration.md) | CLI flags, environment variables, config file |
| [Operations](usage/operations.md) | Startup, shutdown, crash recovery, logging |
| [Troubleshooting](usage/troubleshooting.md) | Common problems and fixes |
| [Limitations](usage/limitations.md) | What this project can't do |
| [Security](usage/security.md) | Risks of the open ports |

### Usage flows

Sequence diagrams of the use cases, each file with its own contents list.

| Flows | What they show |
|---|---|
| [HTTP](usage/flows/http.md) | Reading, waiting, sessions, markers, clear, config, errors, version check |
| [Live feed (SSE)](usage/flows/sse.md) | Subscribe, reconnect (also across restarts), session / clear events, how the client waits |
| [Truncation](usage/flows/truncation.md) | Speech dropped from the full buffer: errors, flags and events in the API, library and CLI |
| [Playwright & MCP](usage/flows/playwright-mcp.md) | Tests through the Playwright server, the fixture, agents through MCP, `503` |
| [Native input](usage/flows/native-input.md) | Foreground window, screen reader commands, input off (planned) |
| [Agents](usage/flows/agents.md) | The CLI agent loop, `tail` |

## Implementation

For contributors: how the bridge and client are built and why.

| Doc | What it covers |
|---|---|
| [Architecture](implementation/architecture.md) | Monorepo, hexagonal bridge and client, UI structure |
| [TCP capture](implementation/tcp-capture.md) | Listener, framing and decoding, from line to speech entry |
| [Decisions](implementation/decisions.md) | Choices that rarely change and why (Node.js, not Go) |
| [Development](implementation/development.md) | Building, testing without Windows, CI and releases |

### Implementation flows

| Flows | What they show |
|---|---|
| [Capture](implementation/flows/capture.md) | Socket voice → parser → speech log → readers |
| [Lifecycle](implementation/flows/lifecycle.md) | Startup order and shutdown |
| [Config](implementation/flows/config.md) | `PUT /config` through the layers |
| [Child services](implementation/flows/child-services.md) | Install, spawn, crash restarts with backoff, giving up |
