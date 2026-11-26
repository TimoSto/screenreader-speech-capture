import { test, expect } from 'screenreader-speech-capture-client/playwright';

const page1 = `<!doctype html>
<html lang="de">
  <head><title>Beispiel Formular</title></head>
  <body>
    <main>
      <h1>Kontakt</h1>
      <label>Name <input name="name" /></label>
      <button type="button" id="send">Absenden</button>
      <div role="status" id="status"></div>
      <script>
        document.getElementById('send').addEventListener('click', () => {
          document.getElementById('status').textContent = 'Nachricht abgesendet';
        });
      </script>
    </main>
  </body>
</html>`;

// A data: URL, not `setContent`: a page without a URL is gone after a reload (about:blank).
const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(page1)}`;

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
});

test('the page title and heading are announced', async ({ page, speech }) => {
  // Reloading makes the screen reader announce the page again.
  await page.reload();
  await speech.waitForOutput(/Beispiel Formular/);
  await speech.waitForOutput(/Kontakt/);
});

test('a focused input is announced with its name and role', async ({ page, speech }) => {
  await page.keyboard.press('Tab');
  await speech.waitForOutput(/Name Eingabefeld Leer/, { normalize: true }); // role wording depends on the screen reader's language; also found if it arrived before this line
});

test('Tab moves to the next control and announces it', async ({ page, speech }) => {
  await page.getByLabel('Name').focus();
  const { entries } = await speech.record(() => page.keyboard.press('Tab'));
  expect(entries.map((e) => e.text).join(' ')).toMatch(/Absenden/);
});

test('a live region announces its update', async ({ page, speech }) => {
  await page.getByRole('button', { name: 'Absenden' }).click();
  await speech.waitForOutput('Nachricht abgesendet');
});
