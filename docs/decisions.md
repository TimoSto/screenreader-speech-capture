# Decisions

Choices that shape the project and rarely change, with the reasons behind them. The code layout,
which changes with refactors, is in [Architecture](architecture.md). One entry per decision, newest
last. Once there are several, they can move to one file each in `docs/decisions/`.

## Node.js, not Go

The bridge is written in **TypeScript on Node.js**:

1. **Playwright server and Playwright MCP are Node programs.** Whatever language the bridge is in,
   Node has to be on the VM. The bridge runs them as supervised child processes and can install
   and start exactly the Playwright version a client needs (`npx playwright@<version> run-server`).
2. **One language end to end.** The bridge, the shared API contract, the client and the SvelteKit
   UI are all TypeScript in one pnpm monorepo.
3. **Simple distribution.** `npm i -g screenreader-speech-capture` works on any machine that
   already has Node for Playwright.

Go's main strength here would be a single static binary. That counts for less when Node has to be
installed anyway.

## One consumer per VM

A bridge serves **one consumer at a time**: one test run, one agent or one person. The screen
reader reads only the foreground window, and there is only one keyboard and one mouse, so two
consumers on the same VM would disturb each other however the bridge arbitrated between them.

So the bridge has no locks, leases or per-client state:

- There is one current [session](speech-capture.md#sessions). Starting a session ends the previous
  one, whoever started it.
- Tests that use the screen reader run serially (`workers: 1`). Parallel runs use several VMs,
  each with its own bridge ([Limitations](limitations.md#scale-and-parallelism)).
- The Playwright server, Playwright MCP and the web UI share the same screen reader. Use one at a
  time.
