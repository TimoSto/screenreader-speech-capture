# Playwright & MCP flows

Sequence diagrams of the remote browser: tests through the Playwright server, agents through
Playwright MCP, both reached through the bridge's HTTP port. Details:
[Remote Playwright & MCP](../playwright-mcp.md).

**Contents**

1. [A test connects to the Playwright server](#a-test-connects-to-the-playwright-server)
2. [A test with the Playwright fixture](#a-test-with-the-playwright-fixture)
3. [An agent drives the browser through MCP](#an-agent-drives-the-browser-through-mcp)
4. [A service that isn't running](#a-service-that-isnt-running)
5. [Host and origin on the passthrough](#host-and-origin-on-the-passthrough)

## A test connects to the Playwright server

The bridge passes `/playwright` through to the Playwright server on `127.0.0.1:3000`. The browser
must be headed, or the screen reader has no window to read.

```mermaid
sequenceDiagram
    participant T as Playwright test<br/>(remote / CI)
    participant B as Bridge :5151
    participant PW as Playwright server<br/>127.0.0.1:3000
    participant Br as Browser
    participant SR as NVDA / JAWS<br/>+ socket voice

    T->>B: WebSocket ws://vm:5151/playwright<br/>launch options: headless false
    B->>PW: same connection (path and Host rewritten)
    PW->>Br: launch Chromium / Chrome / Edge (headed)
    T->>B: page.goto(url), locator.focus()
    B->>PW: protocol messages
    PW->>Br: CDP
    Br-->>SR: focus change (accessibility API)
    SR->>B: "Submit, button" (TCP :4449)
    T->>B: GET /api/v1/speech/wait?contains=Submit (or the client library)
    B-->>T: matched: true
```

## A test with the Playwright fixture

The fixture connects through the bridge, brings the browser to the front (the bridge finds the
window by a title marker; where it can't, a native click on the page content, then a reload), and
wraps every test in a session. Details: [Playwright fixture](../client.md#playwright-fixture),
[Bringing the browser to the front](../native-input.md#bringing-the-browser-to-the-front).

```mermaid
sequenceDiagram
    participant R as Playwright runner<br/>(workers: 1)
    participant F as speech fixture
    participant B as Bridge :5151
    participant Br as Browser on the VM

    R->>F: test "form › submit button is announced"
    F->>B: connect ws://vm:5151/playwright (headless false)
    F->>B: POST /api/v1/sessions {name: test title path, run: run label}
    B-->>F: session, cursor = startSeq
    F->>Br: document.title = "sr-focus-k3x9"
    F->>B: POST /api/v1/input/focus {"target": "playwright", "title": "sr-focus-k3x9"}
    alt window found
        B-->>F: 200 {"title", "pid"}
        F->>Br: put the page title back
    else 404 or 409 INPUT_DISABLED (a browser the bridge can't find)
        F->>B: POST /api/v1/input/click (top-left corner of the page content)
        F->>Br: reload the page
    end
    R->>Br: test body: page actions
    R->>F: speech.waitForOutput("Submit, button")
    F->>B: GET /speech + stream (see the SSE flows)
    B-->>F: entry
    R->>F: test ends
    F->>B: GET /api/v1/speech?session=id (transcript for the report)
    F->>B: POST /api/v1/sessions/end
```

## An agent drives the browser through MCP

Playwright MCP runs in HTTP mode on `127.0.0.1:8931`; the bridge passes `/playwright-mcp` through.
The agent brings MCP's browser to the front with the CLI, operates it with native keys and reads
the speech with it. The whole loop (also markers, and typing through MCP) is in the
[agent flows](agents.md#the-agent-loop). Details:
[Agents](../agents.md#agent-loop).

```mermaid
sequenceDiagram
    participant A as AI agent
    participant B as Bridge :5151
    participant MCP as Playwright MCP<br/>127.0.0.1:8931
    participant Br as Browser (isolated profile)
    participant SR as NVDA / JAWS<br/>+ socket voice

    A->>B: MCP over HTTP: POST /playwright-mcp (browser_navigate)
    B->>MCP: same request, loopback Host
    MCP->>Br: open headed Chromium, go to url
    A->>B: CLI: focus (POST /api/v1/input/focus {"target": "mcp"})
    Note over Br: the foreground window: the screen reader reads it
    A->>B: CLI: press Tab --capture (POST /api/v1/input/keys)
    B->>Br: native Tab
    Br-->>SR: focus change
    SR->>B: "Email, edit" (TCP :4449)
    B-->>A: the speech the key caused
```

## A service that isn't running

While a service is disabled, starting (installing), crashed or failed, its path answers
`503 SERVICE_UNAVAILABLE` in the API's error format. Speech capture and the API keep working.
Details: [Child service crashes](../operations.md#child-service-crashes).

```mermaid
sequenceDiagram
    participant T as Test / agent
    participant B as Bridge :5151

    T->>B: ws://vm:5151/playwright
    B-->>T: 503 SERVICE_UNAVAILABLE (playwright is starting)
    T->>B: GET /api/v1/status
    B-->>T: playwright.state: "starting", bridge.state: "starting"
    Note over T: client: waitForReady() / CLI: status --wait-ready
    T->>B: GET /api/v1/status
    B-->>T: playwright.state: "running", bridge.state: "ready"
    T->>B: ws://vm:5151/playwright
    B-->>T: 101 Switching Protocols
```

## Host and origin on the passthrough

The proxied paths follow the API's [Host and origin](../security.md#host-and-origin) rules, plus a
stricter `Origin` check: a request from a web page with a foreign `Origin` is refused, even a read.

```mermaid
sequenceDiagram
    participant P as Web page in some browser
    participant B as Bridge :5151
    participant MCP as Playwright MCP

    P->>B: POST /playwright-mcp (Origin: https://evil.example)
    B-->>P: 403 FORBIDDEN (never reaches MCP)
    P->>B: GET /playwright-mcp (Host: name not in allowedHosts)
    B-->>P: 403 FORBIDDEN
```
