# Web UI

The web UI served by the bridge, for people watching and configuring it.

The bridge serves a web UI at `http://<vm>:5151/`. It is for **people**: watching what the screen
reader says while you explore a page or debug a test, and setting up the VM. Tests and agents use
the API, the client or the CLI instead. The UI uses only the public HTTP API (see
[UI: SvelteKit, hexagonal-lite](architecture.md#ui-sveltekit-hexagonal-lite)), so it can do nothing a client can't.

A **status bar** at the top of every page shows the TCP state (number of voice connections,
detected encoding), the Playwright server and MCP state with versions, and whether native input is
enabled. It turns red when no voice has connected yet.

## Live log

The main page. It shows speech entries as they arrive (over SSE), newest at the bottom.

- Each row shows the time (`receivedAt`, and the gap to the previous entry), the text, and
  `voice` / `connectionId` when there are several voices. Markers are shown as separator rows.
- **Follow** scrolls to new entries automatically. Scrolling up pauses it, and a "n new"
  button jumps back to the end.
- **Search / filter** by text (substring or regex) and by voice. Markers can be hidden.
- **Add marker** (with a label) and **Clear** (`DELETE /api/v1/speech`, with confirmation).
- **Copy** the visible text, or **export** it as JSON / JSONL / plain text.
- After a reconnect, the UI fetches what it missed with `since=<last seq>`. If the bridge reports
  `truncated: true`, it shows a gap row.

## Settings

A form for the [configuration](configuration.md): ports, hosts, encoding, buffer size, log file,
Playwright / MCP versions, and native input on/off.

- Input is validated in the browser first, then saved with `PUT /api/v1/config`. Errors from the
  bridge are shown next to the field.
- Changes that restart a listener (ports, hosts, TCP settings) are marked. Before saving, the UI
  warns if the change moves the HTTP port the UI itself is running on, and then opens the new
  address.
- **Services:** the state and version of the Playwright server and MCP (from `status`). They are
  switched on and off with their `enabled` setting; there are no start / stop buttons.

## Setup

The [socket voice](vm-setup.md#socket-voice-setup) and [screen reader](vm-setup.md#screen-reader-setup) instructions
from these docs, plus a **check** button. It inserts a marker, asks you to make the screen
reader speak (or sends `Insert+T` through native input, if enabled), and shows a green check when
speech arrives within a few seconds.

## Accessibility of the UI itself

- The UI must itself be usable with a keyboard and a screen reader (landmarks, headings, labelled
  controls, visible focus).
- **No feedback loop:** if the UI is open *on the VM*, the screen reader would read new log rows,
  that speech would be recorded, and so on. So the live log is **not** an ARIA live region by
  default. A setting turns announcements on for people who use the UI from another machine.
- Best practice: open the UI from your own machine, not in the VM's desktop session, so it doesn't
  steal focus from the browser under test.
