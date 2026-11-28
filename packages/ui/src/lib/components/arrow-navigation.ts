import type { Attachment } from 'svelte/attachments';

type Options = {
  /** Only the first item stays in the tab order; items may come, go or move at any time. */
  singleTabStop?: boolean;
};

/**
 * Lets Arrow Down and Arrow Up move between the elements matching `selector` inside the container
 * (without wrapping around).
 */
export function arrowNavigation(
  selector: string,
  { singleTabStop = false }: Options = {},
): Attachment<HTMLElement> {
  return (container) => {
    const items = () => [...container.querySelectorAll<HTMLElement>(selector)];

    const setTabStop = () => {
      items().forEach((item, index) => (item.tabIndex = index === 0 ? 0 : -1));
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (step === 0) return;
      const all = items();
      const index = all.indexOf(event.target as HTMLElement);
      if (index === -1) return;
      // Also at the ends, so the arrows never scroll while an item has the focus.
      event.preventDefault();
      all[index + step]?.focus();
    };

    let observer: MutationObserver | undefined;
    if (singleTabStop) {
      setTabStop();
      observer = new MutationObserver(setTabStop);
      observer.observe(container, { childList: true, subtree: true });
    }
    container.addEventListener('keydown', onKeydown);

    return () => {
      observer?.disconnect();
      container.removeEventListener('keydown', onKeydown);
    };
  };
}
