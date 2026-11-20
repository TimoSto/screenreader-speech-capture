import type { SessionsPaneStorage } from '#lib/core/sessions-pane.js';

export function createSessionsPaneStore(storage: SessionsPaneStorage) {
  let collapsed = $state(false);
  return {
    get collapsed() {
      return collapsed;
    },
    /** Pick up the saved choice. Call it in the browser only, after hydration. */
    init() {
      collapsed = storage.read() ?? false;
    },
    toggle() {
      collapsed = !collapsed;
      storage.write(collapsed);
    },
  };
}
