import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { arrowNavigation } from './arrow-navigation.js';

describe('arrowNavigation', () => {
  let container: HTMLElement;
  let detach: () => void;

  const button = (name: string, className = 'item') => {
    const element = document.createElement('button');
    element.className = className;
    element.textContent = name;
    return element;
  };
  const tabStops = () =>
    [...container.querySelectorAll('button')].map((b) => `${b.textContent} ${b.tabIndex}`);
  const focused = () => document.activeElement?.textContent;
  const focus = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === name)?.focus();

  beforeEach(() => {
    container = document.createElement('div');
    // Two lists with an unrelated action between the items.
    const first = document.createElement('ul');
    first.append(button('One'), button('Action', 'action'), button('Two'));
    const second = document.createElement('ul');
    second.append(button('Three'));
    container.append(first, second);
    document.body.append(container);
    detach = arrowNavigation('.item', { singleTabStop: true })(container) as () => void;
  });

  afterEach(() => {
    detach();
    container.remove();
  });

  it('keeps only the first item in the tab order and leaves other elements alone', () => {
    expect(tabStops()).toEqual(['One 0', 'Action 0', 'Two -1', 'Three -1']);
  });

  it('leaves the tab order alone without singleTabStop', async () => {
    detach();
    for (const item of container.querySelectorAll('button')) item.removeAttribute('tabindex');
    detach = arrowNavigation('.item')(container) as () => void;
    container.querySelector('ul')?.prepend(button('New'));
    await Promise.resolve(); // an observer would have run by now
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);

    focus('One');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Two');
  });

  it('moves down and up across lists and stops at both ends', async () => {
    focus('One');
    await userEvent.keyboard('{ArrowUp}');
    expect(focused()).toBe('One');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Two');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Three');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Three');
    await userEvent.keyboard('{ArrowUp}');
    expect(focused()).toBe('Two');
  });

  it('moves the tab stop with the focus and back to the first once the focus leaves', async () => {
    focus('One');
    await userEvent.keyboard('{ArrowDown}');
    expect(tabStops()).toEqual(['One -1', 'Action 0', 'Two 0', 'Three -1']);
    focus('Action');
    expect(tabStops()).toEqual(['One 0', 'Action 0', 'Two -1', 'Three -1']);
  });

  it('puts the tab stop on the selected item, following the selection', async () => {
    const item = (name: string) =>
      [...container.querySelectorAll('button')].find((b) => b.textContent === name)!;
    item('Two').setAttribute('aria-selected', 'true');
    await expect.poll(tabStops).toEqual(['One -1', 'Action 0', 'Two 0', 'Three -1']);

    focus('Two');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Three');
    focus('Action');
    expect(tabStops()).toEqual(['One -1', 'Action 0', 'Two 0', 'Three -1']);

    item('Two').setAttribute('aria-selected', 'false');
    item('Three').setAttribute('aria-selected', 'true');
    await expect.poll(tabStops).toEqual(['One -1', 'Action 0', 'Two -1', 'Three 0']);
  });

  it('keeps the tab stop on the focused item when the items change', async () => {
    focus('One');
    await userEvent.keyboard('{ArrowDown}');
    container.querySelector('ul')?.prepend(button('New'));
    await expect.poll(tabStops).toEqual(['New -1', 'One -1', 'Action 0', 'Two 0', 'Three -1']);
  });

  it('wraps around the ends with wrap', async () => {
    detach();
    detach = arrowNavigation('.item', { wrap: true })(container) as () => void;
    focus('One');
    await userEvent.keyboard('{ArrowUp}');
    expect(focused()).toBe('Three');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('One');
  });

  it('moves with left and right only with leftRight', async () => {
    focus('One');
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toBe('One');

    detach();
    detach = arrowNavigation('.item', { leftRight: true })(container) as () => void;
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toBe('Two');
    await userEvent.keyboard('{ArrowLeft}');
    expect(focused()).toBe('One');
  });

  it('hands the tab stop to a prepended item and on when the first is removed', async () => {
    container.querySelector('ul')?.prepend(button('New'));
    await expect.poll(tabStops).toEqual(['New 0', 'One -1', 'Action 0', 'Two -1', 'Three -1']);

    container.querySelector('button')?.remove();
    await expect.poll(tabStops).toEqual(['One 0', 'Action 0', 'Two -1', 'Three -1']);
  });

  it.each(['Alt', 'Control', 'Meta', 'Shift'])('ignores arrows with %s held', async (key) => {
    focus('One');
    await userEvent.keyboard(`{${key}>}{ArrowDown}{/${key}}`);
    expect(focused()).toBe('One');
  });

  it('ignores arrows on an element that is not an item', async () => {
    focus('Action');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Action');
  });

  it('does nothing any more once detached', async () => {
    detach();
    focus('One');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('One');
  });
});
