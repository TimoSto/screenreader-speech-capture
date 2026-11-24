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

## Point it at the bridge

```bash
npx screenreader-speech-capture-client config set url http://my-test-vm:5151   # once per user
npx screenreader-speech-capture-client status                                   # checks the connection
```

`SR_SPEECH_URL` (handy in CI) or an explicit URL win over the stored one
([Bridge URL](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#bridge-url)).

## Playwright fixture

```ts
import { test, expect } from 'screenreader-speech-capture-client/playwright';

test('submit button is announced', async ({ page, speech, recordKeys }) => {
  await page.goto('https://example.org/form');
  await page.getByRole('button', { name: 'Submit' }).focus();
  await speech.waitForOutput('Submit, button'); // found even if it was said before this line

  const { entries } = await recordKeys('h'); // a screen reader command and what it said
  expect(entries.map((e) => e.text).join(' ')).toMatch(/heading/i);
});
```

The fixture opens the browser on the VM through the bridge, brings it to the front, and gives each
test its own session with the transcript in the report. Run with `workers: 1`
([Playwright fixture](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#playwright-fixture)).

## Library

```ts
import { SpeechCaptureClient } from 'screenreader-speech-capture-client';

const sr = new SpeechCaptureClient(); // URL from SR_SPEECH_URL or the stored one
await sr.startSession('checkout');
const { entries } = await sr.recordKeys('Insert+T'); // presses the keys, returns what was said
console.log(entries.map((e) => e.text)); // [ 'Checkout - Google Chrome' ]
await sr.endSession();
```

All functions: [Functions](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md#functions).

## CLI for agents and scripts

```bash
npm i -g screenreader-speech-capture-client@<version>
screenreader-speech-capture-client config set output json
screenreader-speech-capture-client session start "audit checkout page"
screenreader-speech-capture-client focus                    # the Playwright MCP browser to the front
screenreader-speech-capture-client press h --capture        # a screen reader command and what it said
screenreader-speech-capture-client --help --json            # every command with its JSON Schema
```

Agents drive the browser through Playwright MCP at `http://my-test-vm:5151/playwright-mcp`. The
loop, exit codes and recovery are in [Agents](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/agents.md).

## Compatibility

The client checks the bridge's API major version on every answer (`IncompatibleBridgeError` when it
differs); the package versions don't have to match
([Versioning](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/http-api.md#versioning)).

## Links

- [Repository](https://github.com/TimoSto/screenreader-speech-capture)
- [Client documentation](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/usage/client.md)
- [All documentation](https://github.com/TimoSto/screenreader-speech-capture/blob/main/docs/README.md)
- [The bridge](https://www.npmjs.com/package/screenreader-speech-capture)

## License

[MIT](https://github.com/TimoSto/screenreader-speech-capture/blob/main/LICENSE)
