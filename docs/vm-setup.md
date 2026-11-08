# VM setup

How to prepare the Windows machine or VM: requirements, the socket voice, the screen reader, and how to run the bridge there.

## Requirements

On the Windows machine or VM that runs the screen reader:

| Requirement | Notes |
|---|---|
| Windows 10 / 11 | Physical or VM. Needs an interactive, unlocked desktop session (see [Running on the VM](#running-on-the-vm)). |
| A firewall rule for the bridge's ports | **Required.** Windows may block the ports without asking (see [Firewall](#firewall)). |
| Node.js ≥ 22.12 | Includes `npx`. The bridge doesn't start on older versions. (The [client](client.md) on your own machine needs only Node ≥ 20.) |
| JAWS **or** NVDA | Both can use SAPI 5 voices. JAWS without a license runs in 40-minute demo mode (see [Running on the VM](#running-on-the-vm)). |
| [`text-to-socket-engine`](https://www.npmjs.com/package/text-to-socket-engine) | The SAPI 5 voice that forwards speech text over TCP. Registering it needs an administrator prompt (see [Socket voice setup](#socket-voice-setup)). |
| Playwright browsers | Installed on first run, or with `npx playwright install`. Branded Chrome / Edge are recommended. |
| [`@jitsi/robotjs`](https://www.npmjs.com/package/@jitsi/robotjs) | Native mouse / keyboard input. A dependency of the bridge with prebuilt Windows binaries, so no build tools are needed. |

For development you also need [pnpm](https://pnpm.io/) (see [Development](development.md)).

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

> **Voice not listed?** See [Troubleshooting](troubleshooting.md#speech).

## Screen reader setup

The UI has the same instructions under **Setup**. In both screen readers, select the voice
**"Text To Socket 127.0.0.1:4449"** (or the display name of a voice you added).

### NVDA

1. Open the NVDA menu (`NVDA+N`) → **Preferences** → **Settings…** → **Speech**.
2. Under **Synthesizer**, choose **Change…** → **Microsoft Speech API version 5** → OK.
3. Under **Voice**, select the socket voice.
4. Optional, for less noisy recordings:
   - **Keyboard** category: turn off *Speak typed characters* and *Speak typed words*.
   - **Speech** category: set *Punctuation/symbol level* to the level your tests expect.
5. Optional: save this as a separate NVDA **configuration profile** so you can switch back to an audible voice.

### JAWS

1. Open JAWS → **Options** → **Voices** → **Voice Adjustment…**.
2. Create or select a **voice profile** and set its **Synthesizer** to **SAPI 5** (the exact label
   can differ between JAWS versions).
3. Select the socket voice as the **Voice** for the profile, and apply it to all contexts
   (PC Cursor, Keyboard, Message, …) so that all speech is captured.
4. Save the profile. Make it the default only on the test VM.
5. Optional: lower verbosity (**Settings Center** → *Verbosity*) to match what your tests expect.

### Checking the setup

With the bridge running, press a key that makes the screen reader speak (for example
`Insert+T` to read the window title). The text should appear in the UI within a few
milliseconds. `GET /api/v1/status` should list at least one entry in `tcp.connections`.

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

Set up the VM like this:

- log on automatically, turn off the screen lock and the screen saver, so the session stays
  interactive and unlocked,
- a fixed screen resolution with **100 % display scaling** (for native clicks),
- don't connect over RDP and then disconnect: a disconnected RDP session has no active desktop.
  Use the hypervisor console, or VNC.

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

In an **administrator** PowerShell, open the ports that are reached remotely (the speech TCP port
stays on loopback). `-Profile Any` includes the *Public* profile, which Windows usually uses for a
hypervisor's virtual network:

```powershell
New-NetFirewallRule -DisplayName "screenreader-speech-capture" `
  -Direction Inbound -Protocol TCP -LocalPort 5151,3000,8931 -Action Allow -Profile Any
```

If someone answered the prompt with *Cancel*, Windows created **Block** rules for `node.exe`.
Block wins over Allow, so remove them:

```powershell
Get-NetFirewallRule -Direction Inbound -Action Block |
  Where-Object DisplayName -like '*node*' | Remove-NetFirewallRule
```

**Check it from the machine that runs the tests**, not from the VM. Use one of the URLs from the
bridge's `listening on …, reachable at …` log line:

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
