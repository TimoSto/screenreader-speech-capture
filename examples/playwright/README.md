# Example: Playwright tests with speech capture

Tests that drive a page and check what the screen reader says, using the client's
[Playwright fixture](../../docs/usage/client.md#playwright-fixture).

They need a VM with the bridge, a screen reader and the socket voice
([VM setup](../../docs/usage/vm-setup.md)), so they do not run in CI.

```bash
SR_SPEECH_URL=http://my-test-vm:5151 pnpm --filter screenreader-speech-capture-example-playwright test
```

Each test gets its own [session](../../docs/usage/speech-capture.md#sessions), and the speech of the
test is attached to the Playwright report as `speech-transcript`.

Before each test the fixture gives the browser window OS-level focus (a native click on the page
content, then a reload), so native keys such as `pressKeys('h')` reach the page. Set
`speechCaptureFocus: false` in `use` where the bridge has no [native input](../../docs/usage/native-input.md).
