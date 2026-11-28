# Web UI

The web UI served by the bridge, for people watching, driving and configuring it.

> **Partly implemented ([M5](../ROADMAP.md#m5-web-ui-)).** Working today: the status chips with a
> refresh button, the [context pane](#context-pane) (sessions), the [live log](#live-log) with
> markers, clear and delete, on the [Settings](#settings) page the color theme, the TCP port, the
> text encoding, the speech buffer size, the Playwright server and its version, Playwright MCP and the
> log level, and on the [Setup](#setup) page the check.
> The rest of this page is design and marked *(planned)*: the status panel, the actions panel, the
> service state on the Settings page and the instructions on the Setup page.

The UI is at `http://<vm>:5151/ui/` (`/` leads there): **Monitor** (`/ui/`), **Settings**
(`/ui/settings`) and **Setup** (`/ui/setup`).

The bridge serves a web UI at `http://<vm>:5151/`. It is for **people**: watching what the screen
reader says while a test or an agent runs, exploring a page by hand, and setting up the VM. Tests
and agents use the API, the client or the CLI instead. The UI uses only the public HTTP API (see
[the web UI](../implementation/architecture.md#the-web-ui-a-sveltekit-bff)), so it can do nothing
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

Selecting the status bar opens the **status panel** *(planned)* with everything from
[`GET /api/v1/status`](http-api.md#endpoints):

- bridge version, API version and state,
- TCP listener (host, port, encoding) and each open connection with its voice and connect time,
- buffer fill (`size` / `maxEntries`, `firstSeq`–`lastSeq`),
- Playwright server and MCP: state, version, port, restarts, last exit code,
- native input: whether the last action was refused with `INPUT_DISABLED`,
- the current session and the number of sessions.

The UI reads `GET /api/v1/status` once on load and again when you click the refresh button in the
status bar; it does not poll. It needs no endpoint of its own.

## Context pane

Lists the [sessions](speech-capture.md#sessions) still in the buffer, so you can tell test runs
and agent tasks apart.

- Sessions are listed newest first (grouping by `run` is *(planned)*). Each shows its name, start
  time, duration and number of entries. The current session has a "live" badge.
- **Outside sessions** lists the entries with `sessionId: null`. An **All** entry (the whole buffer) is *(planned)*.
- **Selecting** a session shows only its entries in the live log, and the URL keeps the selection
  (`?session=7`), so it can be shared or bookmarked.
- **Follow current session** (on by default) switches the selection when a new session starts.
  The UI learns about it from the `session` event of the SSE stream. Selecting another session by
  hand turns following off.
- **New session** starts a session with a name you enter (`POST /api/v1/sessions`), for exploring
  a page by hand. **End session** ends the current one.
- The **collapse** button shrinks the pane to a narrow strip with only the start/end button, and
  gives the room to the log. The browser remembers the choice.
- A session whose entries all left the capped buffer disappears from the list. A gap row in the
  log shows when the selected session lost its oldest entries.

## Live log

The main area. It shows the entries of the selected session, oldest first, newest at the bottom.

- The heading is `#<session id> <session name>`, or "Outside sessions" for the speech outside any
  session.
- Each row shows when it arrived (`receivedAt`, `hh:mm:ss.mmm`), the text, and its `seq`. A marker
  entry (added through the API) is a row with a bookmark pill. A row that just arrived is tinted
  briefly. The `seq` column is hidden when the log is narrow.
- **The current session and "Outside sessions"** show what is in the buffer, then follow new
  speech over SSE (`GET /api/v1/speech/stream`, through the UI's own relay). A dropped connection
  shows "Connection lost, reconnecting…" and the browser resumes with `Last-Event-ID`, so nothing
  is missed or shown twice.
- **An ended session** can't get new entries, so it is read once with `GET /api/v1/speech?session=<id>`
  (in pages of 1000) and no stream is opened. If its entries all left the buffer, the log says so.
- **Follow** scrolls to new entries automatically. Scrolling up pauses it, and a "Jump to latest"
  button resumes it.
- The log keeps the newest 5000 rows of the selected scope.
- **Add marker** (the bookmark button in the log's header) asks for a label and inserts a marker row
  (`POST /api/v1/markers`). The bridge files a marker under the current session, or outside any
  session when none is current, so the button is only shown in the current session and in "Outside
  sessions" while no session is current. It is hidden in an ended session, and in "Outside sessions"
  while a session is live.
- **Clear speech** (the sweep button next to it, in the current session and in "Outside sessions")
  asks to confirm, then removes that scope's entries and markers from the bridge
  (`DELETE /api/v1/speech?session=<id|none>`, see [Sessions](speech-capture.md#sessions)). The
  session keeps running, now empty, and the table follows the bridge's `clear` event. The button is
  disabled while the log is empty, and is not shown in an ended session (delete it instead).
- **Delete session** (the bin button in the log's header, only in an ended session) asks to confirm,
  then removes the session and its speech from the bridge (`DELETE /api/v1/sessions?session=<id>`,
  see [Sessions](speech-capture.md#sessions)) and selects the next older session, or the next newer
  one. With none left, the pane follows the current session, or shows "Outside sessions". The current
  session and "Outside sessions" have no delete button.

Planned, not implemented yet *(planned, [M5](../ROADMAP.md#m5-web-ui-))*:

- **Search / filter** by text (substring or regex) and by voice. Markers can be hidden.
- **Copy** the visible text, or **export** it (the selected session, or all) as JSON / JSONL /
  plain text.
- **Wipe everything** (`DELETE /api/v1/speech`, with a confirmation that names how many sessions
  it removes). Tests and agents don't need it: they start sessions.
- The gap to the previous entry, a `voice` / `connectionId` badge when there are several voices,
  and a gap row when the bridge reports `truncated: true`.

## Actions

*(planned, [M5](../ROADMAP.md#m5-web-ui-))*

The actions panel sends [native input](native-input.md) through the bridge, the same as
`press` and `click` in the CLI. It shows the reason when the bridge answers `INPUT_DISABLED`.

- **Keys:** a field for one chord (`Insert+T`) or a sequence separated by spaces (`h h Insert+Down`),
  with the delay between keys (`delayMs`). Sent with `POST /api/v1/input/keys`. Invalid key names
  are shown next to the field (`INVALID_REQUEST`, `details.field`).
- **Presets:** buttons for common screen reader commands: read title (`Insert+T`), next heading
  (`h`), next link (`k`), elements list (`Insert+F7`), say all (`Insert+Down`). The labels name the NVDA / JAWS command, not only the keys.
- **Click:** x / y in physical screen pixels and the button, sent with `POST /api/v1/input/click`.
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

The page is one pane, like the speech log, with a section per topic (its "Settings" heading is for
screen readers only). Appearance is kept in the browser and applies at once; every other setting is
saved on the bridge and applies when the bridge is restarted.

### Bridge settings

Each section is a form of its own: **Save** (or Enter in a field) saves what changed in that
section with one `PUT /api/v1/config`, **Revert** puts the saved values back. Nothing is saved by
itself. If one value is refused in the browser, nothing is saved and the focus moves to its field.
An error from the bridge is shown under the form, and what was typed stays.

- After a save the form says "Saved." and, if something waits, to restart the bridge.
- A saved setting that isn't in use yet is marked on its field: "Restart pending, in use: …".
- While anything waits, a box at the top lists every such change with what to know before the
  restart, also settings saved through the API that have no field here (shown by their dotted path).
  A restart empties the recorded speech and sessions ([Operations](operations.md#restarting-the-bridge)).
  **Check again** reads the settings and the status again after the restart; the page doesn't poll.
  All of this survives a reload: the page compares `GET /config` with `GET /config?view=saved`.
- A setting a flag or variable sets (`--tcp-port`, `GET /config/overrides`) wins over the config file
  on every start, so the page shows it as text: the value **in use** and what sets it. A value saved
  through the API meanwhile isn't shown, and no restart is asked for.
- If the settings can't be read, one message with **Try again** takes the place of these sections.

### Appearance

The **Color theme** is a radio group: light, dark, high contrast and dark high contrast (black text on
white, or white on black, with 2px outlines and a thicker focus ring). The choice applies at once and is
kept in this browser's `localStorage`; the bridge doesn't know about it. The UI starts light and ignores
the system's `prefers-color-scheme`.

### Speech capture

- **TCP port:** the port the [socket voice](vm-setup.md#socket-voice-setup) sends to (default 4449), a
  whole number from 1 to 65535. The voice on the VM has its port built in, so after a change add a
  whole number from 1 to 65535. The voice on the VM has its port built in, so after a change add a
  voice for the new port (`text-to-socket-engine-add-voice`) and select it.
- **Text encoding:** the code page the voice sends, the VM's ANSI code page
  ([Wire format](speech-capture.md#wire-format)): a list of the Windows code pages and UTF-8. Another
  label saved elsewhere (such as `cp1252`) is shown and kept.
- **Speech buffer size:** how many entries the [buffer](speech-capture.md#buffer) keeps (default
  10 000), a whole number from 1 to 1 000 000.

### Playwright and MCP

- **Playwright server:** a checkbox for [the server](playwright-mcp.md) tests connect to
  (`playwright.enabled`, on by default). While it is off, tests can't use a browser on the VM.
- **Playwright version** of the [Playwright server](playwright-mcp.md#version): an exact version like
  `1.65.0`, or empty for the bundled one (`null`). Its number is under the field while the bundled one
  runs. Whether the version exists is only found out on the next start: the service then fails.
- **Playwright MCP:** a checkbox for [the MCP server](playwright-mcp.md) AI agents connect to
  (`mcp.enabled`, on by default). It brings its own Playwright, so the version above doesn't change it.

### Bridge log

- **Log level** of the [bridge log](operations.md#logging) (`log.level`, default `info`). At `debug`
  the file also gets everything the screen reader says.

### Settings without a field

The rest of the [configuration](configuration.md) is set with a flag, a variable or the config file.
`http.host`, `http.port`, `http.allowedHosts` and `tcp.host` could cut people off from the UI or
weaken its protection ([why](../implementation/decisions.md#the-settings-page-saves-by-section-and-leaves-access-settings-out));
`log.consoleSpeech` can start a speech feedback loop; the ports of the Playwright server and MCP,
`log.file` and `tcp.maxLineBytes` are rarely needed.

### Service state *(planned, [M5](../ROADMAP.md#m5-web-ui-))*

The state and version of the Playwright server and MCP (from `status`) in their section. They are
turned on and off with their checkboxes; there are no start / stop buttons.

## Setup

For checking that the VM is set up: what the bridge knows about it, and a test that speech arrives.
Links on the page open these docs on GitHub, as of the bridge's release (`main` for a preview or a
development build).

The [socket voice](vm-setup.md#socket-voice-setup) and [screen reader](vm-setup.md#screen-reader-setup)
instructions on the page itself are *(planned, [M5](../ROADMAP.md#m5-web-ui-))*.

### Status

One row each, read when the page opens and again with **Check again** (the page doesn't poll):

| Row | Warning when |
|---|---|
| Speech listener, with the port and encoding | the bridge doesn't listen |
| Voice connected, with the number of connections and the voices | never: the voice only [connects with its first words](speech-capture.md#wire-format) |
| Native input and Window focus | not available, with the reason |
| Playwright server and Playwright MCP | crashed or failed (starting and off are not warnings) |

A row that isn't fine links to the page that helps. The library behind native input
([robotjs](https://github.com/jitsi/robotjs)) and window focus
([koffi](https://github.com/Koromix/koffi)) is named with a link to its repository.

### Speech test

- **Listen** waits 30 s for new speech, in any session or outside one. Make the screen reader speak,
  for example with a key press. It adds nothing to the recording.
- **Send Insert+T** (read the window title) sends the keys to the foreground window of the VM with
  [native input](native-input.md), after a marker `ui: Insert+T`, and waits 5 s for the speech after
  that marker. While a session is running it asks first, because the speech lands in that session.
  The button is off when native input isn't available.
- **Stop** ends the test.

When speech arrives, the page shows up to five entries (those that follow until a second passes
without speech). Wrong characters mean the wrong [text encoding](#speech-capture). When nothing
arrives after **Listen**, check the selected voice, its port and, with JAWS,
[language detection](vm-setup.md#jaws-language-detection). When nothing arrives after
**Send Insert+T** but **Listen** works, the keys don't reach the screen reader.

Opened on the VM itself, the arrived text is hidden from the screen reader
(see [Accessibility](#accessibility-of-the-ui-itself)). The screen reader still reads the page, and
that speech can pass the test.

## Accessibility of the UI itself

- The UI must itself be usable with a keyboard and a screen reader (landmarks, headings, labelled
  controls, visible focus). The context pane is a navigation landmark with a list of sessions, and
  the actions panel a labelled region.
- **No feedback loop:** if the UI is open *on the VM*, the screen reader would read new log rows,
  that speech would be recorded, and so on. `aria-live="off"` alone doesn't stop that (a screen
  reader still reads changes in a focused region), so the bridge tells the UI when the page is
  requested from its own machine (a loopback address or one of its own network addresses, such as `http://192.168.x.y:5151/ui/` opened on the VM) and the UI then hides the log rows from the
  accessibility tree (`aria-hidden`, not focusable) and shows a warning banner above the log. Opened from another
  machine the log is a normal, focusable region, and not a live region. A setting that turns
  announcements on for those people *(planned)*.
- Best practice: open the UI from your own machine, not in the VM's desktop session, so it doesn't
  steal focus from the browser under test (see the note under [Actions](#actions)).
