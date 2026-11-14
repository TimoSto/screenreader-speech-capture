# Architecture review: fix now

What is left of the architecture review that can be fixed in today's code. Design notes for later
milestones moved to the [roadmap](ROADMAP.md) and to [architecture.md](architecture.md) (native
input in the bridge and the client, serving the UI). Done items are recorded in
[decisions.md](decisions.md) and in #89, #90 and #92.

This is a working document, not part of the product docs. Once the items are fixed or decided, the
decisions go to [decisions.md](decisions.md) and this file can be deleted.

| # | Finding | Severity |
|---|---|---|
| 1 | ~~No Host / Origin check on the API~~ | Done: #94 |
| 2 | ~~No session filter for entries outside sessions~~ | Done: `session=none` |
| 3 | Reading the status prunes the repositories | Low |
| 4 | `setMaxEntries` is not on the repository port | Low |
| 5 | Test seams in the public `BridgeOptions` | Low |
| 6 | `HttpServer.retire()` closes streams of the new server | Low |

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
