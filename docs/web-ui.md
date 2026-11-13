# Web UI

The web UI served by the bridge, for people watching, driving and configuring it.

> **Planned ([M5](ROADMAP.md#m5-web-ui-)), not implemented yet.** This page describes the design. Until then, follow
> the speech with `npx screenreader-speech-capture-client tail`.

The bridge serves a web UI at `http://<vm>:5151/`. It is for **people**: watching what the screen
reader says while a test or an agent runs, exploring a page by hand, and setting up the VM. Tests
and agents use the API, the client or the CLI instead. The UI uses only the public HTTP API (see
[UI: SvelteKit, hexagonal-lite](architecture.md#ui-sveltekit-hexagonal-lite)), so it can do nothing
a client can't.

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Status bar: voices · Playwright · MCP · input · session          │
├───────────────┬──────────────────────────────────────────────────┤
│ Context pane  │ Live log                                         │
│  (sessions)   │                                                  │
│               ├──────────────────────────────────────────────────┤
│               │ Actions                                          │
└───────────────┴──────────────────────────────────────────────────┘
```

Settings and Setup are separate pages. The status bar, the context pane and the actions panel are
on every page, and on narrow screens the context pane and the actions panel collapse into
toggles.

## Status

**Status bar** at the top of every page: the TCP state (number of voice connections, encoding),
the Playwright server and MCP state with versions, whether native input is enabled, and the
current session. It turns red when no voice has connected yet, and amber when a service is
`crashed` or `failed`.

Selecting the status bar opens the **status panel** with everything from
[`GET /api/v1/status`](http-api.md#endpoints):

- bridge version, API version and state,
- TCP listener (host, port, encoding) and each open connection with its voice and connect time,
- buffer fill (`size` / `maxEntries`, `firstSeq`–`lastSeq`),
- Playwright server and MCP: state, version, port, restarts, last exit code,
- native input on/off, with the reason when it is off (`--no-input`, not on Windows),
- the current session and the number of sessions.

The UI polls `GET /api/v1/status` every 2 s while the tab is visible, and right after its own
actions (saving settings, starting a session). It needs no endpoint of its own.

## Context pane

Lists the [sessions](speech-capture.md#sessions) still in the buffer, so you can tell test runs
and agent tasks apart.

- Sessions are listed newest first, grouped by `run` when they have one. Each shows its name, start
  time, duration and number of entries. The current session has a "live" badge.
- At the top: **All** (the whole buffer) and **Outside sessions** (entries with `sessionId: null`).
- **Selecting** a session shows only its entries in the live log, and the URL keeps the selection
  (`?session=7`), so it can be shared or bookmarked.
- **Follow current session** (on by default) switches the selection when a new session starts.
  The UI learns about it from the `session` event of the SSE stream. Selecting another session by
  hand turns following off.
- **New session** starts a session with a name you enter (`POST /api/v1/sessions`), for exploring
  a page by hand. **End session** ends the current one.
- A session whose entries all left the capped buffer disappears from the list. A gap row in the
  log shows when the selected session lost its oldest entries.

## Live log

The main area. It shows the entries of the selected session as they arrive (over SSE), newest at
the bottom.

- Each row shows the time (`receivedAt`, and the gap to the previous entry), the text, and
  `voice` / `connectionId` when there are several voices. Markers are shown as separator rows.
  With **All** selected, session starts are separator rows too.
- **Follow** scrolls to new entries automatically. Scrolling up pauses it, and a "n new"
  button jumps back to the end.
- **Search / filter** by text (substring or regex) and by voice. Markers can be hidden.
- **Add marker** (with a label) goes into the current session.
- **Copy** the visible text, or **export** it (the selected session, or all) as JSON / JSONL /
  plain text.
- **Wipe everything** (`DELETE /api/v1/speech`, with a confirmation that names how many sessions
  it removes). Tests and agents don't need it: they start sessions.
- After a reconnect, the UI fetches what it missed with `since=<last seq>`. If the bridge reports
  `truncated: true`, it shows a gap row.

## Actions

The actions panel sends [native input](native-input.md) through the bridge, the same as
`press` and `focus` in the CLI. It is disabled, with the reason, when `input.enabled` is `false`.

- **Keys:** a field for one chord (`Insert+T`) or a sequence separated by spaces (`h h Insert+Down`),
  with the delay between keys (`delayMs`). Sent with `POST /api/v1/input/keys`. Invalid key names
  are shown next to the field (`INVALID_REQUEST`, `details.field`).
- **Presets:** buttons for common screen reader commands: read title (`Insert+T`), next heading
  (`h`), next link (`k`), elements list (`Insert+F7`), say all (`Insert+Down`). The labels name the NVDA / JAWS command, not only the keys.
- **Click:** x / y in physical screen pixels and the button, sent with `POST /api/v1/set-focus`.
  This makes a window the foreground window. The UI can't find the browser window under test by
  itself; tests use the client's `setFocus(page)` for that.
- **Send after n seconds** (0–10 s, default 0): sends the input later, with a countdown.
- Every action adds a marker (`ui: Insert+T`) first, so the log shows where its speech starts.
- The last few actions are listed and can be sent again.

> Native input goes to the **foreground window** of the VM. If the UI is open in a browser *on the
> VM*, clicking a button makes the UI that window, and the keys go to the UI. So use the actions
> panel from your own machine. On the VM, use **send after n seconds** and switch to the window
> under test in the meantime.

## Settings

A form for the [configuration](configuration.md): ports, hosts, encoding, buffer size, log file,
Playwright version, and native input on/off.

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
  controls, visible focus). The context pane is a navigation landmark with a list of sessions, and
  the actions panel a labelled region.
- **No feedback loop:** if the UI is open *on the VM*, the screen reader would read new log rows,
  that speech would be recorded, and so on. So the live log is **not** an ARIA live region by
  default. A setting turns announcements on for people who use the UI from another machine.
- Best practice: open the UI from your own machine, not in the VM's desktop session, so it doesn't
  steal focus from the browser under test (see the note under [Actions](#actions)).
