# Web UI design (Material Design 3)

Visual and interaction spec for the bridge's web UI (roadmap milestone **M5**). It builds on
[Web UI](../../usage/web-ui.md), which stays the functional spec. Where the two differ, this file
is newer: see [Changes from web-ui.md](#changes-from-web-uimd). Written against API 1.13.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | This spec: layout, components, states, behavior, API mapping. |
| `tokens.css` | MD3 color roles (light / dark), type scale, shape, layout and behavior tokens as CSS variables. Use as-is in the app. |
| `mockup/monitor.html` | Clickable mockup of the Monitor page. Open it in a browser or WebStorm's preview. Fake data, fake speech every few seconds. The **Mockup state** box (bottom left) or URL params (`?dark=1&voiceConnected=0&inputEnabled=0&mcpState=crashed&simulateSpeech=0`; `inputEnabled=0` shows the state after a `409 INPUT_DISABLED`) switch the bridge states. |
| `mockup/design-system.html` | Tokens and component specimens. |
| `monitor.png`, `monitor-dark-input-unavailable.png`, `design-system.png` | Screenshots: Monitor light, Monitor dark with native input unavailable, design system. |
| `mockup/*.dc.html` | Source of the design canvas (needs the canvas runtime, not viewable on their own). `monitor.html` contains the same markup and logic. |

The mockup is a reference, not code to copy: it is one HTML file with inline styles and a fake
data layer. Build the real UI the way [the architecture](../architecture.md#the-web-ui-a-sveltekit-bff)
describes: `packages/ui`, a SvelteKit BFF; the browser talks only to the BFF, the BFF calls the public
API over loopback; core / adapters / stores / components layers.

## Foundations

- **Color:** MD3 scheme from seed `#415F91`, plus two extended colors: `success` (live, connected,
  running) and `warning` (crashed, truncated). All roles are in `tokens.css`. Light and dark are
  both first-class; the app follows `prefers-color-scheme`, with a manual toggle in the top bar
  (`data-theme` on `<html>`).
- **Tokens:** names follow @material/web (`--md-sys-color-*`, `--md-sys-typescale-*`, `--md-sys-shape-corner-*`,
  `--md-sys-state-*`, `--md-sys-motion-*`), so its components could use the theme as-is. What MD3 does not
  define is prefixed `--app-` (success, warning, layout, mono font). The full 15-style type scale is
  in `tokens.css`; the log text (15/22) and mono (12/16) are the only extra styles.
- **Type:** Roboto Flex for UI, Roboto Mono for everything machine-made (timestamps, gaps, seq,
  key names, endpoints, ids). Self-host both fonts: the VM may have no internet.
- **Elevation is tonal.** Panes differ by surface container level, not shadows. Only dialogs, the
  snackbar and the "n new" button have a shadow.
- **Icons:** Material Symbols (outlined, weight 400, 20–24 px). The mockup uses inline SVG
  look-alikes.
- **State is color + words.** Every status dot carries a label. No information by color alone.

| Role | Used for |
|---|---|
| `primary` | Main actions: + new session, press keys, run browser action, logo tile |
| `primary-container` | Session-start separator rows in the log |
| `secondary-container` | Selection: session row, nav-rail indicator, on-state of chips, segments and the Actions toggle |
| `tertiary-container` / `tertiary` | Marker pills in the log / gaps longer than 3 s |
| `--app-success` (ext.) | LIVE dot, connected voice, running services |
| `--app-warning` (ext.) | Service `crashed` / `failed` (top bar turns amber), "dropped from buffer" gap rows |
| `error` | No voice (top bar turns red + banner), native input off, wipe, stop session, validation errors |
| `inverse-surface` | Snackbar, delayed-send countdown |

## Layout

```
┌──────┬─────────────────────────────────────────────────────────────────────────┐
│ logo │ Speech Capture · host · versions     [status chips…]   ⟳  ☾ │ top app bar (status bar)
├──────┴─────────────────────────────────────────────────────────────────────────┤
│        [No-voice banner, only when no voice is connected]                     │
├──────┬────────────┬──────────────────────────────────────┬────────────────────┤
│ rail │ Sessions + │ Session title          ⌨ │ 🔖 ⧉ ⤓ 🗑 │ Actions          ✕ │
│      │ ─────────  │ [filter…] [.* Regex] [Hide markers]  │ [Keys|Presets|…]   │
│ Mon. │ ● live   ■ │ RECEIVED  GAP  SPOKEN TEXT       SEQ │ tab content        │
│ Sett.│ session    │ … log rows …                         │ (pending send)     │
│ Setup│ session    │                                      │ Recent actions     │
│      │ …          │ SSE ● · Announce ◯       [Following] │                    │
└──────┴────────────┴──────────────────────────────────────┴────────────────────┘
  80 px    300 px              flexible                      360 px, toggleable
```

- The rail is 80 px wide (MD3 navigation rail); the logo tile in the top bar is centered over it, and the app title
  starts where the sessions pane starts.
- Sessions pane and the log pane (which contains the Actions panel) sit in one row that doesn't
  wrap. The **Actions panel lives inside the log pane**, on its right, behind a toggle (keyboard
  icon button in the log toolbar, `aria-expanded`, `aria-controls`). Open by default; remember the
  choice in `localStorage`.
- Gutter 12 px, pane radius 16 px. Surfaces: app `surface`, top bar `surface-container`, sessions
  and Actions `surface-container-low`, log `surface-container-lowest` with an `outline-variant`
  border.
- Window size classes (MD3): expanded and large (>= 840 px) as drawn. Medium (600-839 px): rail stays,
  sessions pane becomes a modal navigation drawer (button in the top bar), Actions a modal side
  sheet. Compact (< 600 px): the rail becomes a bottom navigation bar, the log fills the screen. Not
  drawn in the mockup.

## Components

### Top app bar = status bar

- Logo tile (44 px, radius 14, `primary`), title (title-large), mono subline:
  `host:port · bridge <version> · API <apiVersion> · <state>`.
- Status chips (`ul` labelled "Bridge status"; each chip's `aria-label` carries the state in words):
  `Playwright <version>`, `MCP <version>[ · crashed|failed]`, `Session #<id>` with live dot /
  `No session` (neutral, hollow dot, before the first session). There is no voice (SAPI) chip and no Input chip: native
  input unavailability shows only in the Actions panel. Without an answer from the bridge the
  chips keep the last known values but turn neutral with a red dot. A service that is starting or
  stopped also gets a red dot (not ready); `No session` stays grey.
- Right: a refresh icon button (tooltip "GET /api/v1/status") and a theme toggle. The status is read once on
  load and again only when the refresh button is clicked (no polling); a hidden `role="status"`
  region speaks only problems.
- Bar color: `error-container` when no voice has connected, `warning-container` when Playwright or
  MCP is `crashed`/`failed`, else `surface-container`.
- No voice also shows a banner under the bar (`role="alert"`): what to do + "Open setup".

### Status side sheet

Modal side sheet from the right (400 px, `surface-container-low`). One card per area with a key /
value list: Bridge, TCP listener (+ connections), Buffer, Playwright server, Playwright MCP, Native
input (result of the last input request), Sessions. Same data as `GET /api/v1/status`.

### Navigation rail

Monitor, Settings, Setup. Active item: 56×32 `secondary-container` indicator. Settings and Setup
are not designed yet (see `docs/web-ui.md` for their content).

### Sessions pane

Just a list:

- Header: "Sessions" (title-medium) + **+** icon button (`primary`) → "Start a session" dialog.
- Rows, newest first, no grouping: name (label-large, ellipsis) over one mono meta line
  `#id · run · duration · entries`. Row height 60 px, radius 28, full-row `secondary-container`
  when selected (`aria-current="true"`).
- The current session has a pulsing `success` dot in the meta line and an `error`-colored **stop**
  icon button at the end of the row → "End session #n?" dialog. The stop button is a sibling of
  the row's select button, not inside it.
- The selection is in the URL (`?session=7`).
- **Collapsing:** a **left_panel_close** icon button left of the "Sessions" title (`aria-expanded`,
  label "Collapse sessions" / "Expand sessions") shrinks the pane to a 72 px strip. The strip keeps
  only the two buttons, stacked with the collapse button on top, so it stays at the same x/y as
  when expanded, and a session can still be started or ended; the heading stays
  for screen readers (visually hidden) and the list is removed. The choice is remembered in
  `localStorage` (`sr-sessions-collapsed`) and applied after hydration. No per-session items in
  the strip: a session has no short identifier worth showing.
- Following: selecting the live session keeps following, so a new session is selected when it
  starts. Selecting an ended session stops following. There is no switch for it.
- **Outside sessions:** one row pinned below the list (not part of the newest-first order, no
  radius change): title "Outside sessions", mono meta line with the entry count (`outsideEntries`
  of `GET /sessions`). It selects the entries with `sessionId: null` (`?session=none`, always
  spelled out in the URL). It is hidden while the count is 0, unless it is the selected scope. With
  no current session and no `?session=`, the pane falls back to it, so the log is never empty
  because nothing is selected. There is no "All" row.
- A session disappears once its entries leave the buffer. Empty list: "No sessions in the buffer.
  Start one with +."

### Log pane

> **As built so far (speech table):** the heading is `#id name` with no subline, there is no toolbar,
> no filter row and no `GAP` column (columns: Received, Spoken text, Seq, a real `<table>`), no footer
> except a "reconnecting" / "jump to latest" strip. An ended session is read once instead of
> streamed. Everything else below is still the design.

- **Header:** session name (title-large, `h1`), mono subline `#id · run · started hh:mm:ss ·
  live|ended after …`, plus `client` (the session's `X-SR-Speech-Client`) when set. Toolbar (`role="toolbar"`): Actions toggle, divider, Add marker, Copy
  visible text, Export (JSON / JSONL / text), Wipe everything (`error`).
- **Filter row:** search field (filled, radius 24) for text or regex, filter chips `.* Regex`,
  `Hide markers`, `Voice: all ▾` (only useful with several voices). Invalid regex → error text under
  the row.
- **Column header:** `RECEIVED · GAP · SPOKEN TEXT · SEQ` (label-small, `surface-container-low`).
  Grid `112px 64px 1fr 56px`.
- **Row types:**
  - *Speech:* time `hh:mm:ss.mmm` (mono), gap to the previous speech row (`+0.42s`, `tertiary`
    when > 3 s), text (15/22, wraps), `#seq`. `voice` badge only with several voices.
  - *Marker:* time, `tertiary-container` pill (bookmark icon, mono label, ellipsis, full label as
    tooltip), dashed rule, `#seq`.
  - *Session start* (only when several sessions are shown): `primary-container` pill
    "Session #n · name", rule, time.
  - *Gap:* `warning-container` row: "This session lost its oldest entries…" when `truncated: true`
    or after a reconnect that missed entries.
  - New rows are tinted `--app-new-row` for 1.6 s.
- **Empty state:** mic icon, "No speech yet" (or "Nothing matches the filter"), hint to make the
  screen reader speak or send an action.
- **Footer:** `SSE connected · last id <seq> · <n> shown`, switch "Announce new entries", and at
  the right either the `Following` chip or, when paused, a tonal button "<n> new · jump to latest".
- **Follow:** auto-scroll to the end while following. Scrolling up more than about 48 px pauses
  it; scrolling back to the end or the button resumes.

### Actions panel

Inside the log pane, right, 360 px. Header "Actions" + close button + one-line hint ("Each action
inserts a marker first…"). Segmented button with four tabs:

1. **Keys:** outlined field "Keys" (mono; one chord `Insert+T` or a space-separated sequence
   `h h Insert+Down`; Enter sends), "Delay (ms)" field (`delayMs`), "Send after" chips 0 / 3 / 5 /
   10 s, filled button "Press keys", endpoint caption. Unknown key names: error state with the
   `INVALID_REQUEST` message and `details.field`.
2. **Presets:** list buttons with the command name, the NVDA / JAWS command it is, and the keys
   chip: Read title `Insert+T`, Next heading `h`, Next link `k`, Elements list `Insert+F7`, Say all
   `Insert+Down`. They use the Send after value of the Keys tab.
3. **Click:** X / Y fields (physical pixels), segmented Left / Right / Middle, explanation,
   Send after chips, filled button "Set focus (click)" (`POST /api/v1/input/click`).
4. **Playwright:** info row (MCP endpoint, isolated Chromium, hint to click after switching
   browsers), filter chips Navigate / Click / Type / Press key / Snapshot, fields for the chosen
   action (URL; element description + ref; text; key), filled button "Run `browser_*`", and a
   result card (mono, max 180 px, scrolls) with the MCP response. See
   [Open questions](#open-questions).

- Native input unavailable: `GET /status` has no input flag, so the UI only learns it when a request
  answers `409 INPUT_DISABLED` (robotjs couldn't be loaded, for example not on Windows). From then
  on: an `error-container` note at the top of Keys / Presets / Click, their controls disabled, the
  Actions panel stays disabled (there is no status chip for input). Playwright is unaffected.
- MCP not running: the Playwright info row turns `warning-container` with the reason, and the run
  button is disabled.
- **Delayed send:** an `inverse-surface` card with a big countdown, "Sending <keys>. Switch to the
  window under test now." and Cancel.
- **Recent actions:** last 5, each with a type badge (K / C / P), the label (mono), age and a resend
  icon button.

### Dialogs (MD3 basic dialog, radius 28, `surface-container-high`)

| Dialog | Content | Confirm |
|---|---|---|
| Start a session | Name * (required), Run (optional) | Start |
| End session #n? | Later speech gets `sessionId: null` | End session |
| Wipe everything? | Counts of entries and ended sessions; current session stays, empty | Wipe (`error`) |
| Add marker | Label | Add |

Server validation errors show under the field (`details.field`).

### Snackbar

Bottom center, `inverse-surface`, about 3.5 s. Confirms what happened and which endpoint was
called: "Session #8 started · POST /api/v1/sessions".

## Behavior and API mapping

The browser never calls the bridge directly: every row below is a call the **BFF** makes over
loopback (through the UI ports `StatusApi`, `SessionsApi`, `SpeechFeed`, `InputApi`; Playwright
would need a new port, see open questions). The BFF sends `X-SR-Speech-Client: <host> web-ui`, so
sessions started from the UI are attributed.

| UI | Bridge API (called by the BFF) |
|---|---|
| Status bar, status sheet | `GET /api/v1/status` once on load, then on the refresh button |
| Sessions list | `GET /api/v1/sessions` on load; then SSE `session` events add / update rows (start, end) |
| Outside sessions row | `outsideEntries` of the same `GET /api/v1/sessions` (since API 1.15) |
| + / Start | `POST /api/v1/sessions` `{ name, run? }`. If the answer has `replaced`, snackbar "Replaced session #n (`client`)" |
| Stop / End session | `POST /api/v1/sessions/end` |
| Log of a session | `GET /api/v1/speech?session=<id>&since=<startSeq - 1>` (page with `hasMore`), then `GET /api/v1/speech/stream?session=<id>`, relayed to the browser by a BFF streaming route |
| Log outside sessions | The same with `session=none` and `since=0` (no `startSeq`) |
| Reconnect | SSE `Last-Event-ID`; the stream's first `position` event tells where it starts; `truncated` event or `truncated: true` → gap row |
| Add marker | `POST /api/v1/markers` `{ label }` |
| Wipe | `DELETE /api/v1/speech` |
| Keys / Presets | `POST /api/v1/input/keys` `{ keys, delayMs }` (marker `ui: <keys>` first) |
| Click | `POST /api/v1/input/click` `{ x, y, button }` (marker `ui: click x,y button` first) |
| Playwright | Playwright MCP through the bridge proxy `http://127.0.0.1:<port>/playwright-mcp`, `tools/call` `browser_navigate` / `browser_click` / `browser_type` / `browser_press_key` / `browser_snapshot` (marker `mcp: <tool> …` first). `503` while MCP isn't running. |

- "Live" means: the session's `endedAt` is `null`. It is kept current by the SSE `session` events;
  the status refresh button (`session.current`) is the fallback when the stream is down.
- Copy / export work on the visible (filtered) rows; export names the file
  `session-<id>.<json|jsonl|txt>`.

## Accessibility

- Landmarks: `header`, `nav` "Pages" (rail), `nav` "Sessions", `main` (log pane), the Actions panel
  as a labelled region. `h1` = selected session, `h2` per pane.
- **No feedback loop:** the log is `aria-live="off"` by default. The footer switch "Announce new
  entries" makes it `polite`, for people using the UI from another machine. Don't use
  `role="log"` (it implies `aria-live`).
- Toggles are `aria-pressed` chips / segments or `role="switch"`; the selected session row has
  `aria-current="true"`; icon buttons have `aria-label` and a tooltip.
- Focus ring: 3 px `secondary` outline, 2 px offset, on every control. Dialogs trap focus and return
  it to their trigger.
- All text ≥ 4.5:1 on its container in both schemes. Touch targets ≥ 48 px (controls may look smaller, e.g. 40 px buttons, but get a 48 px hit area).
- Each action inserts its marker first, so speech is attributable without reading timestamps.

## Changes from web-ui.md

- Sessions pane reduced to a plain list: no current-session card, no "Follow current session"
  switch (following is implicit), no grouping by `run` (run is in the meta line), no "All". The
  "Outside sessions" row of web-ui.md stays, pinned below the list, with the entry count.
- Actions moved from below the log into a toggleable panel on the right of the log pane.
- New **Playwright** tab in the Actions panel.

## Open questions

1. **Playwright actions:** the bridge has no `/api/v1` endpoint for them. Option A: the BFF becomes
   an MCP client of `/playwright-mcp` over loopback (new UI port `BrowserApi`; no CORS issue, since
   the browser only talks to the BFF; needs an MCP client in `packages/ui` and MCP's `--isolated`
   session handling). Option B: a small `/api/v1/browser/*` endpoint in the bridge, so the UI stays
   a client of the versioned API only. The mockup is agnostic.
2. **Input availability:** without an input flag in `/status`, the Actions panel can't show
   "unavailable" before the first try. Worth adding `input.available` back to the status DTO?
3. **Settings and Setup pages** are not designed yet.
4. **Narrow screens** (drawer + modal Actions sheet) are only described, not drawn.
