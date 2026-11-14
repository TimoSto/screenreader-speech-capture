# Architecture review: fix now

What is left of the architecture review that can be fixed in today's code. Design notes for later
milestones moved to the [roadmap](ROADMAP.md) and to [architecture.md](architecture.md) (native
input in the bridge and the client, serving the UI). Done items are recorded in
[decisions.md](decisions.md) and in #89, #90 and #92.

This is a working document, not part of the product docs. Once the items are fixed or decided, the
decisions go to [decisions.md](decisions.md) and this file can be deleted.

| # | Finding | Severity |
|---|---|---|
| 1 | No Host / Origin check on the API | Medium |
| 2 | No session filter for entries outside sessions | Low |
| 3 | Reading the status prunes the repositories | Low |
| 4 | `setMaxEntries` is not on the repository port | Low |
| 5 | Test seams in the public `BridgeOptions` | Low |
| 6 | `HttpServer.retire()` closes streams of the new server | Low |

## 1. No Host / Origin check on the API

**What:** `docs/security.md` says the API has no auth and the VM must be isolated. The HTTP server
binds `0.0.0.0` by default (`domain/config/defaults.ts`). The only browser protection is that
bodies must be `application/json` (`adapters/in/http/request.ts`), which only stops cross-origin
form posts.

**Why now:** the machine runs a browser that visits arbitrary pages under test. Such a page can
use **DNS rebinding** to become same-origin with `http://<vm>:5151` and then read the speech and
change the config, including the Playwright version that gets installed. The "isolated VM"
assumption doesn't protect against a page that the VM itself opens. M4 (real keys and clicks) and
M5 (a UI on the same origin) raise the stakes.

**Proposal:**

- Reject requests whose `Host` header is not an IP literal, `localhost`, or a name in a configured
  `http.allowedHosts` (the same idea as Playwright MCP's `--allowed-hosts`, which the bridge
  already passes to MCP).
- Reject state-changing requests with an `Origin` header that isn't the bridge's own origin.
- Keep the shared-secret token on the roadmap as is; this check is independent of it.

## 2. No session filter for entries outside sessions

**What:** the UI's context pane has "Outside sessions" (entries with `sessionId: null`), but
`SessionFilter` is `number | 'current'` (`domain/session.ts`, `adapters/in/http/request.ts`).

**Proposal:** add `session=none` to speech, wait and stream (additive, next API minor). Update
`docs/http-api.md` and `docs/openapi.yaml`.

## 3. Reading the status prunes the repositories

**What:** `GET /status` calls `pruneAndListSessions`, which mutates both repositories
(`application/shared/prune-and-list-sessions.ts`, also used by `session-service.ts`). A read with a
side effect is surprising, and the UI will poll the status every 2 s.

**Proposal:** prune when entries are dropped (in the repository's `add`) instead of on read. An SSE
`status` event, so the UI doesn't poll, can come with M5.

## 4. `setMaxEntries` is not on the repository port

**What:** `composition/reapply.ts` takes the concrete `MemorySpeechRepository` for
`setMaxEntries`. A SQLite repository (Later) would need the same method.

**Proposal:** move `setMaxEntries` (or a `BufferCapacity` port) into the `SpeechRepository` port.

## 5. Test seams in the public `BridgeOptions`

**What:** `BridgeOptions` in `main.ts` imports the `Prepare` type from
`adapters/out/process/types.ts` (`playwrightLaunch`, `mcpLaunch`): a test seam that exposes an
adapter type through the composition root's public options.

**Proposal:** group the test-only options under one object (for example `testSeams`; the name
`testOverrides` is taken by the config helper in `test/helpers.ts`), so the production options stay
small.

## 6. `HttpServer.retire()` closes streams of the new server

**What:** `HttpServer.retire()` (`adapters/in/http/http-server.ts`) calls `sse.closeAll()`, which
also ends streams opened on the **new** server during a restart. The window is tiny, and clients
reconnect.

**Proposal:** let the SSE hub track streams per server and close only the retired server's.
