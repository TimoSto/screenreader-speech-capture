# screenreader-speech-capture

Capture what a screen reader says (JAWS / NVDA via a SAPI 5 socket voice) and expose it over HTTP for automated tests.

The bridge runs on a Windows VM next to the screen reader. It receives the speech on a TCP port (default 4449), records it, and serves it over an HTTP API with a live SSE feed (default 5151). It also supervises a Playwright server and Playwright MCP, and can send native mouse and keyboard input.

## Quick start

```bash
npx screenreader-speech-capture
```

Run it in the interactive user session of the Windows machine, with the socket voice selected in the screen reader.

## Links

- [Repository](https://github.com/TimoSto/screenreader-speech-capture)
- [VM setup](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/vm-setup.md)
- [HTTP API](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/http-api.md)
- [Test client for your tests](https://www.npmjs.com/package/screenreader-speech-capture-client)
