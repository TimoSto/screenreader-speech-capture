# Simplification candidates

A backlog of things to drop or simplify, found by an architect and an engineer review of the code.
It is **not a decision record**: nothing here is agreed yet. Once an item is decided, the lasting
reason goes in [Decisions](decisions.md) and the item is removed from here.

All figures are estimates from reading the code and counting lines. Memory was **not profiled**:
measure the bridge's RSS (`ps -o rss`) before and after any change.

## Where the memory goes

- The bridge process itself is lean: a few MB of heap, a 147 KB bundle, plain `node:http` /
  `node:net`, no web framework. The speech buffer holds 10,000 entries by default (about 3 MB).
- `playwright.enabled` and `mcp.enabled` default to `true`
  (`packages/bridge/src/domain/config/defaults.ts`). Starting the bridge therefore starts two more
  Node processes, plus Chromium once a client connects: roughly 100-300 MB or more.
- The configurable maxima allow far more than any screen reader produces: `maxEntries` up to
  1,000,000 and `maxLineBytes` up to 16 MB (`packages/shared/src/limits.ts`). There is no total-bytes
  cap on the speech log.

## Done

- Client build time: `tsdown` generated declarations from `tsconfig.json`, which includes `test/`,
  so the dts step type-checked the tests too. `packages/client/tsconfig.build.json` (src only)
  halves the build (about 18 s to about 9 s). The generated `index.d.mts` is unchanged.
- Pass-through services: `CaptureService` was the only pure forwarder and is gone. The other
  services hold rules and stay, see [Decisions](decisions.md#services-stay-where-they-hold-a-rule).
- Dead code and needless exports: removed `ConfigPatchDto` and the `export` of `readJson`,
  `MAX_BODY_BYTES`, `errorResponse` and 30 `*Deps` / `*Options` types used only in their own file.
- Client `seen` cap: timeout errors from the client's waits and `waitForSilence` keep the last
  `API_LIMITS.wait.seen` entries, like the bridge.

## Quick wins (low risk)

1. Default `playwright.enabled` and `mcp.enabled` to `false`. Needs docs and test updates and a
   breaking-change PR title (`fix(bridge)!:`).
2. Lower the config maxima: `maxEntries.max` to about 100,000, `maxLineBytes.max` to about 1 MB
   (default 64 KB to something like 16 KB). Optionally add a total-bytes cap in `SpeechLog`.
4. Skip building the transcript string in `TranscriptService` unless debug logging is on; drop the
   listener array copy in `in-process-event-bus.ts`.

## Simplifications (moderate effort, tests need rewiring)

8. **Config validated twice.** The valibot schema in `shared` and the hand-written
   `domain/config/{checks,schema}.ts` in the bridge, held together by `schema-equivalence.test.ts`.
   Use the schema in the bridge (valibot is already bundled). About 90-120 lines.
9. **Three "yield every N" mechanisms** for replay (`sse-hub.ts`, `composition/pace.ts`,
   `follow-log.ts`). Careful: they protect the no-gap, no-duplicate SSE guarantee.
10. **Generated artifacts.** `cli-output.schema.json` (742 lines) is generated from valibot schemas;
    `openapi.yaml` (1,235 lines) is half generated, half hand-written. Drop the CLI schema, and make
    the OpenAPI file either fully generated or fully hand-written. Saves about 1,900 lines of
    artifacts and one or two devDependencies.
11. **Live `PUT /config` re-apply** (`changedSections`, `restart.ts`, `composition/reapply.ts`).
    Few settings can change live. Restart-to-apply would remove about 300-400 lines but is an API
    change (version bump).

## Needs a decision (largest payoff, highest risk)

12. **Playwright / MCP supervision stack** (about 1,300 lines, over 20% of the bridge, M3 is marked
    done): process supervisor, per-version npm installer, Playwright server and MCP runners, HTTP and
    WebSocket proxy. It does not capture or serve speech. Options: (a) keep, off by default; (b) drop
    only the per-version installer and the `playwright.version` setting (about 300 lines, removes the
    runtime `npm install`); (c) remove supervision and the proxy and document running
    `playwright run-server` yourself.
13. **`tools/release`** (about 530 lines plus about 290 lines of workflows): independent per-package
    versions from Conventional Commit PR titles. Bridge and client ship together, so a single version
    and `npm version` may be enough if releases are rare.
14. **DTO mapping layer** (`adapters/in/http/dto/*`): about 100-150 lines that map field by field.
    It is a deliberate rule in `CLAUDE.md`; only drop it for less ceremony.

## Keep as is

`SpeechLog` and its sessions, the SSE hub and TCP parser (resource handling is correct and
bounded), the `Clock` and `ConfigStore` ports, `tools/fake-speech`, `text-match`.
