# screenreader-speech-capture

Capture what a screen reader says (JAWS / NVDA via a SAPI 5 socket voice) and expose it over HTTP for automated tests.

The bridge runs on a Windows VM next to the screen reader. It receives the speech on a TCP port (default 4449), records it, and serves it over an HTTP API with a live SSE feed (default 5151). It also supervises a Playwright server and Playwright MCP, and can send native mouse and keyboard input.

## Quick start

On the Windows machine, in a normal (non-elevated) prompt of the logged-in user:

```bash
npm i -g screenreader-speech-capture@<version>
screenreader-speech-capture
```

Pin the version and install globally rather than using `npx`, which picks up new versions on every
start. It needs Node.js ≥ 22.12, the [socket voice](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/vm-setup.md#socket-voice-setup)
selected in NVDA or JAWS, and internet access on the first start (it installs Playwright and Chromium).
Follow the [setup checklist](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/vm-setup.md#checklist).

## Links

- [Repository](https://github.com/TimoSto/screenreader-speech-capture)
- [VM setup](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/vm-setup.md)
- [HTTP API](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/http-api.md)
- [Test client for your tests](https://www.npmjs.com/package/screenreader-speech-capture-client)

## License

[MIT](https://github.com/TimoSto/screenreader-speech-capture/blob/main/LICENSE)
