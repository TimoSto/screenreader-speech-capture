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
| 2 | ~~No session filter for entries outside sessions~~ | Done: #95 |
| 3 | ~~Reading the status prunes the repositories~~ | Done: #96 |
| 4 | ~~`setMaxEntries` is not on the repository port~~ | Done: on the port |
| 5 | Test seams in the public `BridgeOptions` | Low |
| 6 | `HttpServer.retire()` closes streams of the new server | Low |

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
