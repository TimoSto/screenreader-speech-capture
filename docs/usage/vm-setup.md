# VM setup

How to prepare the Windows machine or VM: requirements, the socket voice, the screen reader, and how to run the bridge there.

> **Not yet checked end to end on a real VM.** The steps follow the components' sources and docs;
> the smoke test that verifies them (NVDA + socket voice + Chrome) is part of
> [M7](../ROADMAP.md#m7-distribution-).

## Checklist

In this order (*admin* = an elevated prompt, everything else as the normal user):

1. Install [Node.js](#requirements) ≥ 22.12 (the LTS installer from nodejs.org, or
   `winget install OpenJS.NodeJS.LTS`).
2. *Admin:* [install and register the socket voice](#socket-voice-setup).
3. [Install the bridge](#install-the-bridge), pinned, and start it once: the first start downloads
   Playwright and Chromium.
4. *Admin:* [open the firewall](#firewall) for port 5151, and check it from the test machine.
5. Install NVDA or JAWS and [select the socket voice](#screen-reader-setup).
6. [Check the setup](#checking-the-setup): speech arrives, and `status` shows a voice connection
   and native input.
7. [Prepare the VM](#prepare-the-vm): auto-logon, no lock, 100 % scaling, no notifications, the
   bridge and the screen reader start at sign-in.
8. Optional: take a VM snapshot, to reset to before every CI run.

## Requirements

On the Windows machine or VM that runs the screen reader:

| Requirement | Notes |
|---|---|
| Windows 10 / 11 | Physical or VM. Needs an interactive, unlocked desktop session (see [Running on the VM](#running-on-the-vm)). |
| A firewall rule for the bridge's ports | **Required.** Windows may block the ports without asking (see [Firewall](#firewall)). |
| Node.js ≥ 22.12 | Includes `npx`. The bridge doesn't start on older versions. (The [client](client.md) on your own machine needs only Node ≥ 20.) |
| JAWS **or** NVDA | Both can use SAPI 5 voices. JAWS without a license runs in 40-minute demo mode (see [Running on the VM](#running-on-the-vm)). |
| [`text-to-socket-engine`](https://www.npmjs.com/package/text-to-socket-engine) | The SAPI 5 voice that forwards speech text over TCP. Registering it needs an administrator prompt (see [Socket voice setup](#socket-voice-setup)). |
| Playwright browsers | Playwright's Chromium is installed automatically ([Install](playwright-mcp.md#install)). Branded Chrome / Edge are recommended; install them yourself (their installers need administrator rights). |
| Internet access on the first start | The bridge installs the configured Playwright version from the npm registry and downloads Chromium for the Playwright server and for MCP (possibly two builds, a few hundred MB each). Behind a proxy, set npm's proxy settings and `HTTPS_PROXY`. Later starts need no network. |
| [`@jitsi/robotjs`](https://www.npmjs.com/package/@jitsi/robotjs) | Native keys and clicks. An **optional** dependency with prebuilt Windows binaries, installed with the bridge; no build tools needed. Without it the bridge still runs, and the input endpoints answer `INPUT_DISABLED`. |
| [`koffi`](https://koffi.dev/) | Bringing a browser window to the front (`focus`, `setFocus`). Also **optional** and installed with the bridge, prebuilt. Without it clients fall back to a native click. |

Whether the two optional packages loaded shows in `input` of `npx screenreader-speech-capture-client status`
(`native` and `focus`, each with the `reason` when it is off) and in the `[native-input]` line of the bridge log.

**Administrator rights** are needed only for registering the voice, the firewall rule and installing
Chrome / Edge. The bridge itself must run **without** them ([why](#run-in-the-user-session-not-as-a-service)).

For development you also need [pnpm](https://pnpm.io/) (see [Development](../implementation/development.md)).

## Install the bridge

In a **normal** (non-elevated) prompt, install a pinned version globally and start it:

```powershell
npm i -g screenreader-speech-capture@x.y.z    # the version you tested with; see the npm page for the newest
screenreader-speech-capture
```

The first start installs Playwright and Chromium in the background (the bridge log shows
`[playwright-server]` and `[playwright-mcp]` output; `status --wait-ready` waits for it), and prints
the URLs it can be reached at. A global install, not `npx`: `npx` looks the package up on every
start and picks up new versions without notice. The `npm warn install-scripts` line is expected
([below](#the-install-scripts-warning)). Update by installing the new version the same way.

## Socket voice setup

[`text-to-socket-engine`](https://github.com/AmadeusITGroup/Assistive-Webdriver/tree/master/components/text-to-socket-engine)
is a SAPI 5 text-to-speech engine that produces no audio. It sends every piece of text it is asked
to speak to a TCP address that is set per voice.

### Install

In an **administrator** prompt:

```powershell
npm install -g text-to-socket-engine
text-to-socket-engine-register
```

The package ships a 32-bit and a 64-bit DLL (`TextToSocketEngine-x86.dll`,
`TextToSocketEngine-amd64.dll`). `text-to-socket-engine-register` registers both and creates
the default voice in both, so 32-bit and 64-bit screen readers can use it:

| Voice id | Display name | Sends to |
|---|---|---|
| `textToSocketVoice` | `Text To Socket 127.0.0.1:4449` | `127.0.0.1:4449` |

### More voices / other ports

```powershell
# text-to-socket-engine-add-voice <id> "<display name>" <host> <port> [tcpHeader]
text-to-socket-engine-add-voice ssc5000 "Text To Socket 127.0.0.1:5000" 127.0.0.1 5000 voice=ssc5000

text-to-socket-engine-remove-voice ssc5000
text-to-socket-engine-unregister      # removes the engine and the default voice
```

The optional `tcpHeader` is sent once as the first line of every new connection. Give it the
form **`voice=<id>`**, so the bridge can tell it apart from speech (see
[Speech capture](speech-capture.md)). The bridge stores `<id>` as `voice` on each
speech entry, which tells you which voice it came from when several are in use.

### A German voice

`add-voice` always registers a voice as English (en-US, language `409`). A German JAWS only lists
SAPI 5 voices whose language matches its voice profile, so it doesn't offer the socket voice until
the voice is also marked as German (seen with JAWS in German on a German Windows).

**Mark the default voice (`textToSocketVoice`) as German as well**, in an **administrator** prompt.
`text-to-socket-engine-register` created the voice in both the 64-bit and the 32-bit registry view,
so change both:

```powershell
# 64-bit view
reg add "HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens\textToSocketVoice\Attributes" /v Language /t REG_SZ /d "407;409" /f
reg add "HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens\textToSocketVoice" /v 407 /t REG_SZ /d "Text To Socket 127.0.0.1:4449" /f

# 32-bit view
reg add "HKLM\SOFTWARE\WOW6432Node\Microsoft\Speech\Voices\Tokens\textToSocketVoice\Attributes" /v Language /t REG_SZ /d "407;409" /f
reg add "HKLM\SOFTWARE\WOW6432Node\Microsoft\Speech\Voices\Tokens\textToSocketVoice" /v 407 /t REG_SZ /d "Text To Socket 127.0.0.1:4449" /f
```

- `Language` `407;409` marks the voice as German **and** English (SAPI allows a `;`-separated list).
  `407` is the hex language id of German (Germany). If a screen reader still doesn't list the voice,
  use just `407`; an English-only screen reader may then stop listing it.
- SAPI reads a voice's display name from a value named after the language id. Registration only
  writes `409` (English), so the second command adds a `407` value with the same name. Without it,
  some voice lists show the voice without a name or skip it
  ([what registration writes](../implementation/text-to-socket-engine/voice-registration.md#creating-the-token)).
- Restart the screen reader completely afterwards.
- Running `text-to-socket-engine-register` again (or `add-voice` with the id `textToSocketVoice`)
  writes the voice anew as English: run the commands again after it. Adding voices with other ids
  doesn't touch it.

**Or add a separate German voice** on the **bridge's port** and change its language the same way:

```powershell
text-to-socket-engine-add-voice voiceDe "Text To Socket DE" 127.0.0.1 4449 voice=voiceDe
reg add "HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens\voiceDe\Attributes" /v Language /t REG_SZ /d 407 /f
reg add "HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens\voiceDe" /v 407 /t REG_SZ /d "Text To Socket DE" /f
```

- The port must be the one the bridge listens on (`tcp.port`, default `4449`). A different port
  sends nothing, silently: the bridge only listens on one port.
- The package ships 32-bit and 64-bit DLLs. If the voice only shows in a 32-bit screen reader, also set
  the values under `HKLM\SOFTWARE\WOW6432Node\Microsoft\Speech\Voices\Tokens\voiceDe`.

A German JAWS also needs *Detect Language Changes* turned off
([JAWS language detection](#jaws-language-detection)).

> **Voice not listed?** See [Troubleshooting](troubleshooting.md#speech).

## Screen reader setup

The UI has the same instructions under **Setup** *(planned, [M5](../ROADMAP.md#m5-web-ui-))*.
In both screen readers, select the voice
**"Text To Socket 127.0.0.1:4449"** (or the display name of a voice you added).

Check the screen reader's **bitness**: a 64-bit screen reader only sees the 64-bit voice
registration, a 32-bit one only the 32-bit one. `text-to-socket-engine-register` registers both,
but a voice added later with `add-voice` or a registry change (as for the German voice) may need
both views ([bitness](../implementation/text-to-socket-engine/quirks.md#bitness)).

### NVDA

1. Open the NVDA menu (`NVDA+N`) → **Preferences** → **Settings…** → **Speech**.
2. Under **Synthesizer**, choose **Change…** → **Microsoft Speech API version 5** → OK.
3. Under **Voice**, select the socket voice.
4. Optional, for less noisy recordings:
   - **Keyboard** category: turn off *Speak typed characters* and *Speak typed words*.
   - **Speech** category: set *Punctuation/symbol level* to the level your tests expect.
5. Optional: save this as a separate NVDA **configuration profile** so you can switch back to an audible voice.
6. **General** category: turn on *Start NVDA after I sign in*, so NVDA runs after a VM restart.

### JAWS

With a German (or other non-English) JAWS, first mark the voice with that language
([A German voice](#a-german-voice)): otherwise JAWS doesn't list it in step 3.

1. Open JAWS → **Options** → **Voices** → **Voice Adjustment…**.
2. Create or select a **voice profile** and set its **Synthesizer** to **SAPI 5** (the exact label
   can differ between JAWS versions).
3. Select the socket voice as the **Voice** for the profile, and apply it to all contexts
   (PC Cursor, Keyboard, Message, …) so that all speech is captured.
4. Save the profile. Make it the default only on the test VM.
5. Turn off *Detect Language Changes* ([below](#jaws-language-detection)), or web pages are read
   by another voice.
6. Optional: lower verbosity (**Settings Center** → *Verbosity*) to match what your tests expect.
7. Let JAWS start at sign-in (**Settings Center** or the Startup Wizard: *Automatically start JAWS*
   after signing in; the label differs between JAWS versions), so it runs after a VM restart.

#### JAWS language detection

With *Detect Language Changes* (German: *Sprachwechsel erkennen*) on, JAWS reads a page with the
voice its profile assigns to the page's language (`lang="de"`, `lang="en"`), not with the socket
voice. That voice is usually an audible one: the page is read aloud and never reaches the bridge,
while JAWS's own messages (window titles, menus) still do. This happens with any JAWS language,
whenever a page's `lang` differs from the profile's.

1. Open **Settings Center** (`Insert+F2`).
2. Search for *Detect Language Changes* (*Sprachwechsel erkennen*) and turn it off (some versions
   offer *Never* instead of a checkbox).

If your tests need language switching, keep it on and instead select the socket voice for every
language in the voice profile (**Voice Adjustment…**, see step 3 above; *Stimmenprofile* in a
German JAWS).

### Checking the setup

The [Setup page](web-ui.md#setup) of the web UI (`http://localhost:5151/ui/setup` on the VM) shows
what the bridge knows about the setup and tests that speech arrives. By hand:

With the bridge running, press a key that makes the screen reader speak (for example
`Insert+T` to read the window title). The text should appear within a few milliseconds in
`npx screenreader-speech-capture-client tail`, or on the Monitor page of the [web UI](web-ui.md)
(`http://localhost:5151/ui/`). Then, from the machine that runs the tests:

```bash
npx screenreader-speech-capture-client status --url http://<vm-ip>:5151
```

It should show at least one voice connection (`tcp.connections`), native input and focus as
available (`input`), and the Playwright server and MCP as `running` once their first install is
done. A native key press through the bridge checks the whole chain, keyboard hook included:

```bash
npx screenreader-speech-capture-client press Insert+T --capture --url http://<vm-ip>:5151
```

The exact text depends on the screen reader, its version and its verbosity settings. Phrases like
`"Submit, button"` in these docs are only examples.

## Running on the VM

### Run in the user session, not as a service

Windows services run in **session 0**. Browsers started there are invisible to the
screen reader on the user's desktop, and native input can't reach the desktop. Run the bridge
**in the logged-in user session** instead, **non-elevated**:

- **Task Scheduler**: trigger *At log on*, action `cmd /c screenreader-speech-capture`,
  with *Run only when user is logged on* selected and *Run with highest privileges* **not** selected.
- or a shortcut in the **Startup** folder (`shell:startup`).

Install a **pinned version** globally (`npm i -g screenreader-speech-capture@x.y.z`) instead of
using `npx` at log on. At log on the network may not be ready yet, and `npx` would pick up new
versions without notice.

#### The `install-scripts` warning

Recent npm versions print this when you install globally:

```text
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   @jitsi/robotjs@0.6.24 (install: node-gyp-build)
```

It is expected and harmless. `@jitsi/robotjs` is the only dependency with an install script
(`node-gyp-build`); Playwright and `@playwright/mcp` have none, so they don't show up. npm only
warns that a future version will block such scripts by default. The script still runs, and the
package ships prebuilt Windows binaries that load either way, so native input works. To silence
the warning, allow the script: `npm i -g --allow-scripts=@jitsi/robotjs screenreader-speech-capture@x.y.z`
(once) or `npm config set allow-scripts=@jitsi/robotjs --location=user` (for all global installs).
The bridge's own Playwright install runs with `--ignore-scripts` and prints nothing.

### Prepare the VM

Set up the VM like this:

- log on automatically, turn off the screen lock and the screen saver, so the session stays
  interactive and unlocked,
- a fixed screen resolution with **100 % display scaling** (for native clicks),
- don't connect over RDP and then disconnect: a disconnected RDP session has no active desktop.
  Use the hypervisor console, or VNC,
- turn off **notifications** (Settings → System → Notifications, or *Do not disturb* / Focus
  assist): a toast takes the focus, gets spoken and lands in the recording,
- pause or schedule **Windows Update**, so it doesn't restart the VM during a run,
- start the bridge ([above](#run-in-the-user-session-not-as-a-service)) and the screen reader
  ([NVDA](#nvda), [JAWS](#jaws)) at sign-in.

### Screen reader licensing

- **NVDA** is free and has no time limit.
- **JAWS** without a license runs in **40-minute demo mode** and then needs a Windows restart.
  For CI, either license JAWS for the VM or restart / reset the VM snapshot before each run.

### Firewall

**This step is required.** Without it, the bridge works on the VM itself (`localhost`), but other
machines can't reach it, and you get no error message: their requests just time out.

Don't wait for Windows to ask. The "Allow access" prompt often doesn't appear:

- **Windows Server** doesn't show it by default,
- it can be turned off (`Get-NetFirewallProfile | Select-Object Name, NotifyOnListen`),
- it appears only once per program path, so a new Node or `npx` path is blocked without a prompt.

In an **administrator** PowerShell, open the HTTP port, the only one reached remotely: the
Playwright server and MCP are reached through it, and they and the speech TCP port stay on
loopback. `-Profile Any` includes the *Public* profile, which Windows usually uses for a
hypervisor's virtual network:

```powershell
New-NetFirewallRule -DisplayName "screenreader-speech-capture" `
  -Direction Inbound -Protocol TCP -LocalPort 5151 -Action Allow -Profile Any
```

If someone answered the prompt with *Cancel*, Windows created **Block** rules for `node.exe`.
Block wins over Allow, so remove them:

```powershell
Get-NetFirewallRule -Direction Inbound -Action Block |
  Where-Object DisplayName -like '*node*' | Remove-NetFirewallRule
```

**Check it from the machine that runs the tests**, not from the VM. Use one of the URLs from the
bridge's `HTTP API` row in the `ready` summary:

```bash
curl http://<vm-ip>:5151/api/v1/status
```

| Result | Meaning |
|---|---|
| JSON | Works. Store the URL with `config set url` ([Bridge URL](client.md#bridge-url)). |
| Times out | The firewall drops the request: the rule is missing, or a Block rule wins. |
| Connection refused | Nothing listens there: the bridge isn't running, or it listens on `127.0.0.1` only (`--host`). |

With libvirt / KVM, the VM's address is something like `192.168.122.177`. `192.168.122.1` is the
**host's** address on that network (the VM's gateway), not the VM's. Run `ipconfig` on the VM or
`virsh net-dhcp-leases default` on the host to find the VM's address.
