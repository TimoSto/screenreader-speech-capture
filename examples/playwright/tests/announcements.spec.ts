import { test, expect } from 'screenreader-speech-capture-client/playwright';

const page1 = `<!doctype html>
<html lang="en">
  <head><title>Example form</title></head>
  <body>
    <main>
      <h1>Contact</h1>
      <label>Name <input name="name" /></label>
      <button type="button" id="send">Submit</button>
      <div role="status" id="status"></div>
      <script>
        document.getElementById('send').addEventListener('click', () => {
          document.getElementById('status').textContent = 'Message sent';
        });
      </script>
    </main>
  </body>
</html>`;

test.beforeEach(async ({ page }) => {
  await page.setContent(page1);
});

test('the page title and heading are announced', async ({ page, speech }) => {
  // Reloading makes the screen reader announce the page again.
  await page.reload();
  await speech.waitForOutput(/Example form/);
});

test('a focused button is announced with its name and role', async ({ page, speech }) => {
  await page.getByRole('button', { name: 'Submit' }).focus();
  await speech.waitForOutput(/Submit.*button/i); // also found if it arrived before this line
});

test('Tab moves to the next control and announces it', async ({ page, speech }) => {
  await page.getByLabel('Name').focus();
  const { entries } = await speech.record(() => page.keyboard.press('Tab'));
  expect(entries.map((e) => e.text).join(' ')).toMatch(/Submit.*button/i);
});

test('a live region announces its update', async ({ page, speech }) => {
  await page.getByRole('button', { name: 'Submit' }).click();
  await speech.waitForOutput('Message sent');
});
