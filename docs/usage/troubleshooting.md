# Troubleshooting

Common problems, what causes them and how to fix them. Start with
`npx screenreader-speech-capture-client status` and the [bridge log](operations.md#logging).

## Connection

| Symptom | Likely cause | Fix |
|---|---|---|
| `status` exits with code `2`, or `curl http://<vm-ip>:5151/...` times out, but `http://localhost:5151` works on the VM | The Windows firewall drops the requests, often without ever showing a prompt. | Add the firewall rule and remove `node.exe` Block rules ([Firewall](vm-setup.md#firewall)). |
| The bridge URL doesn't answer, even on the VM | It is the hypervisor host's address (for example `192.168.122.1` with libvirt), not the VM's. | Use an address from the bridge's `reachable at` log line or from `ipconfig` on the VM ([Firewall](vm-setup.md#firewall)). |
| `403 FORBIDDEN`: `Host "…" is not allowed` | The client reaches the bridge through a DNS name that isn't the VM's own name. The bridge refuses unknown names against DNS rebinding. | Add the name with `--allowed-hosts` or `http.allowedHosts`, or use the VM's IP address ([Host and origin](security.md#host-and-origin)). |
| `connection refused` | The bridge isn't running, or listens on `127.0.0.1` only. | Start it, check `--host`, and read the [bridge log](operations.md#logging). |
| The bridge doesn't start at all | Node.js is older than 22.12. | Install a current Node.js LTS ([Requirements](vm-setup.md#requirements)). |

## Speech

| Symptom | Likely cause | Fix |
|---|---|---|
| No speech arrives, `tcp.connections` is empty | The screen reader doesn't use the socket voice. | Select **"Text To Socket 127.0.0.1:4449"** as the voice ([Screen reader setup](vm-setup.md#screen-reader-setup)). |
| | The voice sends to another port than the bridge listens on. | Compare the port in the voice's display name with `--tcp-port`. |
| | The bridge started after the screen reader spoke, and the engine gave up on that text. | Nothing to fix: the next `Speak` call opens a new connection. Start the bridge before the screen reader if you need the first words. |
| The socket voice is not in the screen reader's voice list | SAPI keeps separate voice lists for 32-bit and 64-bit programs, and the voice is only registered for one. | Check both control panels (`%windir%\SysWOW64\Speech\SpeechUX\sapi.cpl` for 32 bit, `%windir%\System32\Speech\SpeechUX\sapi.cpl` for 64 bit). Run `text-to-socket-engine-register` again in an **administrator** prompt and restart the screen reader ([Socket voice setup](vm-setup.md#socket-voice-setup)). |
| Characters are wrong, or arrive as `?` | The text is decoded with the wrong code page, or the code page can't represent the character. | Check `tcp.encoding` in `status`. Set `--tcp-encoding` to the VM's code page. Characters outside the ANSI code page can't be fixed on the bridge side ([Wire format](speech-capture.md#wire-format)). |
| The first line of a connection is missing | It looked like `voice=<id>` and was taken as the header. | Rare. Give voices a header so the first line is always the header. |
| `truncated: true` in a response | The buffer was full and dropped entries you asked for. | Raise `buffer.maxEntries`, or wipe old sessions with `clear()` when you no longer need them. |
| Text differs from what you expected (`"Submit button"` instead of `"Submit, button"`) | Wording depends on screen reader, version, language and verbosity. | Use `normalize`, a regex, or record the real text once and assert on that. See [Limitations](limitations.md). |
| Speech you never heard is recorded | Speech that the screen reader interrupted is still recorded. | Expected. Use `waitForSilence()` and assert on the last entries. |

## Browser and input

| Symptom | Likely cause | Fix |
|---|---|---|
| The browser opens, but the screen reader says nothing about the page | The browser runs **headless** (no window). | Pass `headless: false` (the fixture will do it, [M3](../ROADMAP.md#m3-playwright--mcp-)) ([Playwright server](playwright-mcp.md#playwright-server)). |
| | The browser window is not the **foreground** window. | `setFocus(page)` or CLI `focus` ([Native input](native-input.md), *planned, [M4](../ROADMAP.md#m4-native-input-)*). Until then, click the window yourself. |
| Nothing works after an RDP session | The disconnected RDP session has no active desktop: no input, no foreground window. | Use the hypervisor console or VNC. Don't leave the VM on a disconnected RDP session ([Running on the VM](vm-setup.md#running-on-the-vm)). |
| Screen reader commands (`H`, `Insert+T`) do nothing | They were sent with Playwright (`page.keyboard`), which the screen reader never sees. | Use `pressKeys()` / CLI `press` ([Native input](native-input.md), *planned, [M4](../ROADMAP.md#m4-native-input-)*). |
| `pressKeys` / `focus` returns `409 INPUT_DISABLED` | Native input is off. | Remove `--no-input`. Native input only works on Windows. *(planned, [M4](../ROADMAP.md#m4-native-input-))* |
| Native clicks land in the wrong place | Display scaling, browser zoom, or several monitors. | See the caveats in [Native input](native-input.md). *(planned, [M4](../ROADMAP.md#m4-native-input-))* |
| Native input does nothing at all | The bridge runs elevated or as a service, or the screen is locked. | Run non-elevated in the logged-in, unlocked user session. |

## Versions and services

| Symptom | Likely cause | Fix |
|---|---|---|
| `browserType.connect` fails with a protocol / version error | The client's Playwright version differs from the server's. | Set `--playwright-version` to the version of your test project. `status` shows the server's version. |
| The client throws `IncompatibleBridgeError` (CLI exit code `2`) | Bridge and client have different API major versions. | Compare `apiVersion` in `status` with the client's and update the older one. The package versions of bridge and client don't have to match ([Versioning](http-api.md#versioning)). |
| `browserType.connect` fails with `Executable doesn't exist at …chrome-headless-shell` | The browser was launched headless, and the bridge doesn't install the headless-only build. A headless browser has no window for the screen reader anyway. | Launch with `headless: false` ([Playwright server](playwright-mcp.md#playwright-server)). |
| Playwright or MCP stays `starting`, then `crashed`, and the log shows npm errors | The automatic install can't reach the npm registry or the browser download (offline, proxy). | Configure npm's proxy (`npm config set proxy …`) and `HTTPS_PROXY` for the browser download, or copy the cache folders from another machine ([Install](playwright-mcp.md#install)). |
| `status` shows Playwright or MCP as `failed` | The service crashed 5 times in a row. | Look at the bridge log for its output, fix the cause, then restart the bridge ([Operations](operations.md#child-service-crashes)). |
| MCP clients from other machines are rejected | MCP only accepts some hosts. | The bridge starts MCP with `--allowed-hosts *`. If you start MCP yourself, add that flag. |
| The bridge exits right after start: port in use | Another bridge (or another program) already uses the port. | Stop the other process or change the port. For the TCP port, change the voice too. |

## Screen reader

| Symptom | Likely cause | Fix |
|---|---|---|
| JAWS stops talking after about 40 minutes | JAWS runs in demo mode without a license. | Restart Windows, reset the VM snapshot before each CI run, or license JAWS ([Screen reader licensing](vm-setup.md#screen-reader-licensing)). |
| Lots of extra speech while typing | Typing echo is on. | Turn off *Speak typed characters / words* in NVDA, or the JAWS equivalent. |
| The screen reader keeps reading the bridge console, in a loop | The console shows the speech (`--console-speech` is on), or a voice reconnects for every phrase so `connection … opened` lines keep coming. | Turn `--console-speech` off, keep the focus away from the console (start it minimized), or use `--log-level warn`. Read the speech in the log file instead ([Operations](operations.md#speech-text-stays-off-the-console)). |
| The UI's own log rows get recorded | The UI is open on the VM and its announcements are on. | Open the UI from another machine, or keep the live log announcements off ([Web UI](web-ui.md#accessibility-of-the-ui-itself)). |
