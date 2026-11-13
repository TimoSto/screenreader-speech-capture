# Limitations

What this project can't do, so you can decide early whether it fits your tests.

## What is captured

- **Text sent to speech, not what was heard.** The socket voice gets text when the screen reader
  asks for it to be spoken. Speech that was interrupted a moment later is still recorded, and there
  is no audio, no speech rate and no information on how long speaking took
  ([Wire format](speech-capture.md#wire-format)).
- **No timing from the screen reader.** `receivedAt` is when the bridge received the line, which is
  close to, but not exactly, when the screen reader decided to speak.
- **No braille.** Braille display output doesn't go through SAPI and is not captured.
- **No prosody or markup.** SSML, pitch changes, sounds and earcons (for example NVDA's browse mode
  beeps) are not forwarded.

## Screen readers and platforms

- **NVDA and JAWS on Windows only.** Both can use SAPI 5 voices.
- **Not Narrator.** Narrator doesn't use third-party SAPI 5 voices.
- **Not VoiceOver, TalkBack, Orca or mobile.** They don't use SAPI. A different capture would be a
  new driving adapter (see [Architecture](architecture.md#bridge-hexagonal-ports--adapters)).
- **Wording is not portable.** The text depends on the screen reader, its version, the language and
  the verbosity settings. A test written against NVDA needs its own expectations for JAWS, and may
  need updating after a screen reader update.

## Browsers

- **Chrome, Edge and Playwright's Chromium** are the target.
- **Firefox** may work but is not verified.
- **WebKit** is not supported: Playwright's WebKit build on Windows doesn't expose an accessibility
  tree that screen readers can use.

## Scale and parallelism

- **One screen reader, one foreground window per VM.** Tests that use the screen reader run
  serially (`workers: 1`). To run in parallel, use several VMs, each with its own bridge.
- **The MCP browser and test browsers share the screen.** Use only one at a time
  ([Remote Playwright & MCP](playwright-mcp.md#playwright-mcp)).
- **Memory only.** Speech is kept in memory and lost on restart. Export it from the
  [web UI](web-ui.md) if you need a record.

## Environment

- Needs an **interactive, unlocked desktop session**. No Windows service, no locked screen, no
  disconnected RDP session ([Running on the VM](vm-setup.md#running-on-the-vm)).
- Native clicks *(planned, [M4](ROADMAP.md#m4-native-input-))* assume **100 % display scaling** and one monitor ([Native input](native-input.md)).
- **No authentication.** Only use it on isolated test networks ([Security](security.md)).
