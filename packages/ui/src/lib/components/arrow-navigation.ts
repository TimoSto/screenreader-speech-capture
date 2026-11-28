import type { Attachment } from 'svelte/attachments';

type Options = {
  /**
   * The items are one tab stop: the one with the focus, else the selected one (`aria-selected`),
   * else the first. Items may come, go or move at any time.
   */
  singleTabStop?: boolean;
  /** Down on the last item goes to the first, and up on the first to the last. */
  wrap?: boolean;
  /** Arrow Right works like Arrow Down, and Arrow Left like Arrow Up. */
  leftRight?: boolean;
};

/** Lets the arrow keys move between the elements matching `selector` inside the container. */
export function arrowNavigation(
  selector: string,
  { singleTabStop = false, wrap = false, leftRight = false }: Options = {},
): Attachment<HTMLElement> {
  const steps = new Map([
    ['ArrowDown', 1],
    ['ArrowUp', -1],
  ]);
  if (leftRight) steps.set('ArrowRight', 1).set('ArrowLeft', -1);

  return (container) => {
    const items = () => [...container.querySelectorAll<HTMLElement>(selector)];

    const setTabStop = () => {
      const all = items();
      const stop =
        all.find((item) => item === document.activeElement) ??
        all.find((item) => item.getAttribute('aria-selected') === 'true') ??
        all[0];
      for (const item of all) item.tabIndex = item === stop ? 0 : -1;
    };

    /** The focus left the items: back to the selected one, for the next time. */
    const onFocusOut = (event: FocusEvent) => {
      if (!items().includes(event.relatedTarget as HTMLElement)) setTabStop();
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const step = steps.get(event.key);
      if (step === undefined) return;
      const all = items();
      const index = all.indexOf(event.target as HTMLElement);
      if (index === -1) return;
      // Also at the ends, so the arrows never scroll while an item has the focus.
      event.preventDefault();
      const next = wrap ? (index + step + all.length) % all.length : index + step;
      all[next]?.focus();
    };

    let observer: MutationObserver | undefined;
    if (singleTabStop) {
      setTabStop();
      observer = new MutationObserver(setTabStop);
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributeFilter: ['aria-selected'],
      });
      container.addEventListener('focusin', setTabStop);
      container.addEventListener('focusout', onFocusOut);
    }
    container.addEventListener('keydown', onKeydown);

    return () => {
      observer?.disconnect();
      container.removeEventListener('focusin', setTabStop);
      container.removeEventListener('focusout', onFocusOut);
      container.removeEventListener('keydown', onKeydown);
    };
  };
}
