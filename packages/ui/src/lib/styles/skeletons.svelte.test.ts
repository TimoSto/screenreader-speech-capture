import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import globalStyles from './global.css?inline';
import tokens from './tokens.css?inline';

// The test page has the Material elements defined. A frame has its own element registry, so in it
// they are as in the server's HTML before the scripts have run.
describe('placeholders for undefined elements', () => {
  let frame: HTMLIFrameElement;
  const added: Element[] = [];

  beforeEach(() => {
    frame = document.createElement('iframe');
    frame.width = '600';
    document.body.append(frame);
    for (const target of [frame.contentDocument!, document]) {
      const style = target.createElement('style');
      style.textContent = tokens + globalStyles;
      target.head.append(style);
      added.push(style);
    }
  });

  afterEach(() => {
    for (const element of [frame, ...added.splice(0)]) element.remove();
  });

  function render(target: Document, html: string): HTMLElement {
    const host = target.createElement('div');
    host.innerHTML = html;
    target.body.append(host);
    added.push(host);
    return host.firstElementChild as HTMLElement;
  }

  const undefinedElement = (html: string) => render(frame.contentDocument!, html);
  const styleOf = (element: Element, pseudo?: string) =>
    frame.contentWindow!.getComputedStyle(element, pseudo);

  it.each(['md-outlined-text-field', 'md-outlined-select'])(
    'draws a field and a line of text for %s',
    (tag) => {
      const field = undefinedElement(`<${tag} label="Port" supporting-text="Help"></${tag}>`);

      expect(field.matches(':not(:defined)')).toBe(true);
      expect(field.getBoundingClientRect().height).toBe(76);
      expect(styleOf(field, '::before').height).toBe('56px');
      expect(styleOf(field, '::after').height).toBe('10px');
      expect(styleOf(field, '::before').animationName).toBe('skeleton-shimmer');
    },
  );

  it('does not list the options of a select', () => {
    const select = undefinedElement(
      '<md-outlined-select><md-select-option><div slot="headline">utf-8</div></md-select-option></md-outlined-select>',
    );

    expect(select.getBoundingClientRect().height).toBe(76);
    expect(styleOf(select.firstElementChild!).display).toBe('none');
  });

  it.each([
    ['md-filled-button', 'Save'],
    ['md-text-button', 'Revert'],
    ['md-outlined-button', 'Check again'],
    ['md-text-button', 'OK'],
  ])('keeps the room of a %s "%s"', async (tag, label) => {
    const html = `<${tag}>${label}</${tag}>`;
    const placeholder = undefinedElement(html);
    // In a flex row, as the form's buttons are: not stretched to the width of the page.
    const real = render(document, `<${tag}>${label}</${tag}>`);
    real.parentElement!.style.display = 'flex';
    await (real as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    expect(placeholder.matches(':not(:defined)')).toBe(true);
    const expected = real.getBoundingClientRect();
    const actual = placeholder.getBoundingClientRect();
    expect(actual.height).toBe(expected.height);
    expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(0.5);
    expect(styleOf(placeholder).color).toBe('rgba(0, 0, 0, 0)');
  });

  it('shows nothing of a dialog', () => {
    const dialog = undefinedElement(
      '<md-dialog><div slot="headline">Start a session</div></md-dialog>',
    );

    expect(dialog.getBoundingClientRect().height).toBe(0);
    expect(styleOf(dialog).display).toBe('none');
  });
});
