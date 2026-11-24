import { test, expect } from 'screenreader-speech-capture-client/playwright';

const html = `<!doctype html>
<html lang="en">
  <head><title>Headings</title></head>
  <body>
    <h1>Start</h1>
    <h2>Details</h2>
  </body>
</html>`;

// A data: URL, not `setContent`: a page without a URL is gone after a reload (about:blank).
const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

// The fixture gives the browser window OS-level focus before each test (turn off with
// `speechCaptureFocus: false`), so native keys reach the page.
test('the screen reader jumps to the next heading', async ({ page: p, recordKeys }) => {
  await p.goto(pageUrl);
  // Browse mode: H moves to the next heading (NVDA / JAWS quick navigation). The bridge records
  // from right before the key until the speech pauses.
  const { entries } = await recordKeys('h');
  expect(entries.map((e) => e.text).join(' ')).toMatch(/heading/i);
});

test('setFocus brings the window to the front and it is announced', async ({
  page: p,
  setFocus,
  speech,
}) => {
  await p.goto(pageUrl);
  // The bridge brings the window to the front, and the screen reader announces it with its
  // title. Where the bridge can't, the fallback clicks and reloads, which announces it too.
  await setFocus();
  await speech.waitForOutput(/Headings/);
});
