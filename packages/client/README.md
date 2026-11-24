# screenreader-speech-capture-client

Test client for the screenreader-speech-capture bridge: library, Playwright fixture and CLI.

It talks to the bridge's HTTP API so your tests and agents can wait for and check what the screen reader announced.

## Install

```bash
npm install --save-dev screenreader-speech-capture-client@<version>
```

Node.js ≥ 20. Your project needs `@types/node`. `@playwright/test` is an optional peer dependency, needed
only for the Playwright fixture; its version must be exactly the bridge's Playwright version. See
[Setting up a test project](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#setting-up-a-test-project).

## Links

- [Repository](https://github.com/TimoSto/screenreader-speech-capture)
- [Client documentation](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md)
- [The bridge](https://www.npmjs.com/package/screenreader-speech-capture)

## License

[MIT](https://github.com/TimoSto/screenreader-speech-capture/blob/main/LICENSE)
